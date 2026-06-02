import { createDefaultPlanningState, createProductionBundle, routeTemplateOptions } from "./data.js";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, SLOT_STATUSES, STATUS_LABELS } from "./types.js";
import {
  addMs,
  buildTimeScale,
  dateToX,
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime,
  fromDateInput,
  isoLocal,
  scaleConfig,
  snapDate,
  startOfDay,
  toDate,
  toDateInput,
} from "./time.js";
import {
  byId,
  calculateProjectProgress,
  getDependencyPairs,
  getProjectRouteSteps,
  getSlotWarnings,
} from "./validation.js";

const STORAGE_KEY = "mes-planning-prototype-state-v2";
const UI_STORAGE_KEY = "mes-planning-prototype-ui-v1";
const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
const DIRECTORY_DEFAULTS_STORAGE_KEY = "mes-planning-prototype-directories-defaults-restored-v1";
const CALCULATOR_STORAGE_KEY = "mes-planning-prototype-complexity-calculator-v5";
const AUTH_STORAGE_KEY = "mes-planning-prototype-auth-v1";
const UPDATE_DISMISSED_STORAGE_KEY = "mes-planning-prototype-update-dismissed-v1";
const APP_VERSION = "v.1.161";
const UPDATE_CHECK_INTERVAL_MS = 10000;
const STATE_RESET_BACKUP_STORAGE_KEY = "mes-planning-prototype-state-reset-backup-v1";
const PLANNING_BACKUP_STORAGE_KEY = "mes-planning-prototype-planning-backup-v1";
const DIRECTORY_BACKUP_STORAGE_KEY = "mes-planning-prototype-directories-backup-v1";
const DIRECTORY_DELETED_ENTITIES_STORAGE_KEY = "mes-planning-prototype-directories-deleted-entities-v1";
const STORAGE_KEYS = [
  STORAGE_KEY,
  UI_STORAGE_KEY,
  DIRECTORY_STORAGE_KEY,
  DIRECTORY_DEFAULTS_STORAGE_KEY,
  CALCULATOR_STORAGE_KEY,
  AUTH_STORAGE_KEY,
  UPDATE_DISMISSED_STORAGE_KEY,
  DIRECTORY_DELETED_ENTITIES_STORAGE_KEY,
];
const CRITICAL_DIRECTORY_SECTION_IDS = ["bomLists", "specifications"];
const LEFT_WIDTH = 360;
const TIMELINE_HEIGHT = 48;
const GANTT_SNAP_MS = 15 * 60 * 1000;
const TIMELINE_LOAD_CHUNK = { hours: 24, days: 14, weeks: 6 };
const TIMELINE_MAX_COUNT = { hours: 240, days: 120, weeks: 52 };
const PROJECT_ROW_HEIGHT = 82;
const WORK_ROW_HEIGHT = 58;
const WEEK_SLOT_HEIGHT = 18;
const WEEK_SLOT_GAP = 3;
const WEEK_SLOT_TOP = 6;
const STANDARD_SLOT_TOP = 6;
const STANDARD_SLOT_HEIGHT = 26;
const AGGREGATE_SLOT_TOP = 12;
const AGGREGATE_SLOT_HEIGHT = 22;
const MIN_OPERATION_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_ROUTE_BUFFER_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHIFT_CYCLE_ANCHOR_DATE = "2026-06-01";
const DEFAULT_RESOURCE_CPH = 30000;
const SMT_LINE_WORKCENTER_PREFIX = "smt-line:";
const GANTT_ZOOM_LEVELS = [0.75, 1, 1.5, 2, 3, 4, 6, 8];
const GANTT_SLOT_CONTENT_MODES = [
  { id: "operationQuantity", label: "Операция + кол-во", shortLabel: "Опер. + кол." },
  { id: "operation", label: "Операция", shortLabel: "Операция" },
  { id: "quantity", label: "Количество", shortLabel: "Кол-во" },
  { id: "batchStep", label: "Партия и шаг", shortLabel: "Партия" },
];
const WORK_CENTER_RATES = {
  smt: 55,
  aoi: 110,
  wash: 150,
  manual: 25,
  test: 35,
  coating: 80,
  mechanic: 45,
  assembly: 30,
  warehouse: 300,
};
const OBSOLETE_DIRECTORY_ROW_IDS = {
  departments: new Set(["dep-pdo", "dep-pcb", "dep-eng"]),
  equipment: new Set(["eq-yamaha", "eq-koh"]),
};
const EMPLOYEE_DEPARTMENT_MIGRATION = {
  "ПДО": "Отдел программной подготовки изделий",
  "Производство": "SMT отдел",
  "STM отдел": "SMT отдел",
};
const UNIT_TYPE_LABELS = {
  production: "Производственное",
  administrative: "Административное",
  warehouse: "Склад",
  quality: "Контроль",
  service: "Сервисное",
};
const PRODUCTION_RESOURCE_TYPE_LABELS = {
  line: "Производственная линия",
  machine: "Станок",
  workplace: "Рабочее место",
  post: "Пост",
  equipment: "Оборудование",
  tool: "Оснастка",
  normative: "Норматив подразделения",
};
const PRODUCTION_RESOURCE_TYPE_CODES = {
  line: "Лин.",
  machine: "Ст.",
  workplace: "РМ",
  post: "Пост",
  equipment: "Обор.",
  tool: "Осн.",
  normative: "Норм.",
};
const WORK_SHIFT_OPTIONS = [
  { value: "5/2 08:00-20:00", label: "5/2 · 08:00-20:00" },
  { value: "2/2 08:00-20:00", label: "2/2 · 08:00-20:00" },
  { value: "2/2 20:00-08:00", label: "2/2 · 20:00-08:00" },
  { value: "6/1 08:00-20:00", label: "6/1 · 08:00-20:00" },
  { value: "24/7", label: "24/7" },
];
const LEGACY_DEPARTMENT_TO_WORK_CENTER_ID = {
  "SMT отдел": "smt",
  "STM отдел": "smt",
  "ОТК / AOI-контроль": "aoi",
  "Отмывка": "wash",
  "THT отдел": "manual",
  "ОТК / Испытания": "test",
  "Отдел ручной лакировки": "coating",
  "Отдел селективной лакировки": "coating",
  "Слесарный отдел": "mechanic",
  "Сборочный отдел": "assembly",
  "Склад компонентов": "warehouse",
  "Склад готовой продукции": "warehouse",
  "Слесарный участок": "mechanic",
};
const LEGACY_WORK_CENTER_NAME_MIGRATION = {
  "Слесарный участок": "Слесарное подразделение",
};

const DEFAULT_DEPARTMENTS = [
  { id: "dep-planning", name: "Производственное планирование", code: "PLAN", owner: "Анна Морозова", status: "Активен" },
  { id: "dep-smt", name: "SMT отдел", code: "SMT", owner: "Павел Ким", status: "Активен" },
  { id: "dep-aoi-qc", name: "ОТК / AOI-контроль", code: "QA-AOI", owner: "Мария Волкова", status: "Активен" },
  { id: "dep-wash", name: "Отмывка", code: "WASH", owner: "Дмитрий Орлов", status: "Активен" },
  { id: "dep-tht", name: "THT отдел", code: "THT", owner: "Игорь Семенов", status: "Активен" },
  { id: "dep-test", name: "ОТК / Испытания", code: "TEST", owner: "Мария Волкова", status: "Активен" },
  { id: "dep-manual-coating", name: "Отдел ручной лакировки", code: "COAT-M", owner: "Мария Волкова", status: "Активен" },
  { id: "dep-selective-coating", name: "Отдел селективной лакировки", code: "COAT-S", owner: "Игорь Семенов", status: "Активен" },
  { id: "dep-mechanic", name: "Слесарный отдел", code: "MECH", owner: "Дмитрий Орлов", status: "Активен" },
  { id: "dep-assembly", name: "Сборочный отдел", code: "ASM", owner: "", status: "Активен" },
  { id: "dep-programming", name: "Отдел программной подготовки изделий", code: "PROG", owner: "Анна Морозова", status: "Активен" },
  { id: "dep-procurement", name: "Закупки и снабжение", code: "PROC", owner: "", status: "Активен" },
  { id: "dep-component-warehouse", name: "Склад компонентов", code: "WH-C", owner: "", status: "Активен" },
  { id: "dep-finished-warehouse", name: "Склад готовой продукции", code: "WH-FG", owner: "", status: "Активен" },
];

const app = document.querySelector("#app");

function renderFatalStartupError(error) {
  if (!app) return;
  const message = error?.message || String(error || "Неизвестная ошибка");
  const stack = error?.stack || "";
  app.innerHTML = `
    <main class="auth-shell" aria-label="Ошибка запуска MES">
      <section class="auth-card">
        <div class="auth-logo-row">
          <span class="auth-logo">M</span>
          <div>
            <strong>MES</strong>
            <small>${escapeHtml(APP_VERSION)}</small>
          </div>
        </div>
        <h1>Ошибка запуска интерфейса</h1>
        <p>${escapeHtml(message)}</p>
        ${stack ? `<pre style="white-space:pre-wrap; max-height:260px; overflow:auto;">${escapeHtml(stack)}</pre>` : ""}
      </section>
    </main>
  `;
}

window.addEventListener("error", (event) => {
  renderFatalStartupError(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  renderFatalStartupError(event.reason || "Unhandled promise rejection");
});

const defaultUiState = {
  activeModule: "gantt",
  activeDirectory: "workCenters",
  activeProjectId: "",
  activeSpecificationId: "",
  spekiEditingId: "",
  spekiCheckedSpecificationId: "",
  spekiStaleItemIds: [],
  spekiCollapsedBomIds: [],
  activeBomId: "",
  activeNomenclatureId: "",
  activeOperationId: "",
  nomenclatureTypeFilter: "all",
  activeRouteId: "",
  calculatorStep: "inputs",
  confirmDialog: null,
  directoryEditor: null,
  selectedDirectoryRows: {},
  scale: "days",
  windowStart: "2026-06-01",
  search: "",
  statusFilter: "all",
  workCenterFilter: "all",
  rowMode: "route",
  autoCascade: true,
  ganttZoom: 1,
  ganttSlotContent: "operationQuantity",
  timelineCounts: { hours: scaleConfig.hours.count, days: scaleConfig.days.count, weeks: scaleConfig.weeks.count },
  expandedProjects: new Set(["p-x100", "p-v2", "p-mes"]),
  selectedSlotId: null,
  editor: null,
  splitSlotId: null,
  projectModal: false,
  drag: null,
  scrollLeft: 0,
  scrollTop: 0,
  now: new Date(),
};

const defaultCalculatorState = {
  projectId: "",
  specificationId: "",
  noSpecification: false,
  bomListId: "",
  workCenterId: "",
  resourceId: "",
  boardQuantity: "",
  boardsPerPanel: "",
  efficiency: 88,
  componentCounts: {},
  componentCountsByOperation: {},
  routeOperations: [],
  selectedOperationId: "",
  lastSavedAt: "",
  inputsSavedAt: "",
  inputsSavedSignature: "",
  routeSavedSignature: "",
};

handleDevResetParams();

const BOM_COMPONENT_FIELDS = [
  { key: "c0402", componentId: "ct-0402", label: "0402" },
  { key: "c0603", componentId: "ct-0603", label: "0603" },
  { key: "c0805", componentId: "ct-0805", label: "0805" },
  { key: "csot23", componentId: "ct-sot23", label: "SOT-23" },
  { key: "csoic", componentId: "ct-soic", label: "SOIC" },
  { key: "cqfn", componentId: "ct-qfn", label: "QFN" },
  { key: "cbga", componentId: "ct-bga", label: "BGA" },
  { key: "cconnector", componentId: "ct-connector", label: "Разъемы" },
];
const DEFAULT_COMPONENT_TYPES = [
  { id: "ct-0402", name: "Чип 0402", package: "0402", family: "R/C/L", coefficient: 0.85, placementsPerHour: 36000, setupSeconds: 12, defaultCount: 42, status: "Активен" },
  { id: "ct-0603", name: "Чип 0603", package: "0603", family: "R/C/L", coefficient: 1, placementsPerHour: 32000, setupSeconds: 12, defaultCount: 36, status: "Активен" },
  { id: "ct-0805", name: "Чип 0805", package: "0805", family: "R/C/L", coefficient: 1.15, placementsPerHour: 28000, setupSeconds: 12, defaultCount: 18, status: "Активен" },
  { id: "ct-sot23", name: "SOT-23 / SOD", package: "SOT-23", family: "Дискреты", coefficient: 1.55, placementsPerHour: 19000, setupSeconds: 18, defaultCount: 6, status: "Активен" },
  { id: "ct-soic", name: "SOIC / TSSOP", package: "SOIC/TSSOP", family: "Микросхемы", coefficient: 2.2, placementsPerHour: 12000, setupSeconds: 26, defaultCount: 2, status: "Активен" },
  { id: "ct-qfn", name: "QFN / DFN", package: "QFN", family: "Микросхемы", coefficient: 3.8, placementsPerHour: 6200, setupSeconds: 34, defaultCount: 1, status: "Активен" },
  { id: "ct-bga", name: "BGA", package: "BGA", family: "Микросхемы", coefficient: 5.5, placementsPerHour: 3600, setupSeconds: 45, defaultCount: 0, status: "Активен" },
  { id: "ct-connector", name: "Разъем / крупный корпус", package: "Connector", family: "Крупные", coefficient: 4.6, placementsPerHour: 4200, setupSeconds: 40, defaultCount: 3, status: "Активен" },
];

const DEFAULT_ROLES = [
  { id: "role-admin", name: "Администратор системы", code: "ADMIN", accessLevel: 100, modules: "*", directories: "*", permissions: "create, read, update, delete, approve, reset, admin", status: "Активен" },
  { id: "role-planner", name: "Планировщик производства", code: "PLANNER", accessLevel: 70, modules: "gantt, planning, operationMap, calculator, routes, bomLists, speki, nomenclature, directories", directories: "workCenters, productionResources, componentTypes, nomenclatureTypes, employees, norms, statuses", permissions: "create, read, update, schedule, approve", status: "Активен" },
  { id: "role-engineer", name: "Инженер-технолог", code: "ENGINEER", accessLevel: 55, modules: "operationMap, calculator, routes, bomLists, speki, nomenclature, directories", directories: "productionResources, componentTypes, nomenclatureTypes, workCenters, norms", permissions: "read, update, calculate", status: "Активен" },
  { id: "role-operator", name: "Оператор производства", code: "OPERATOR", accessLevel: 35, modules: "gantt, planning", directories: "productionResources, workCenters, statuses", permissions: "read, execute, comment", status: "Активен" },
  { id: "role-viewer", name: "Наблюдатель", code: "VIEWER", accessLevel: 10, modules: "gantt, operationMap, routes, bomLists, speki", directories: "statuses", permissions: "read", status: "Активен" },
];

const DEFAULT_RESOURCES = [
  { id: "res-smt-1", name: "Линия SMT-1 · Hanwha S2/L2", type: "Линия", workCenter: "SMT-монтаж", capacity: "1 партия / смена", baseCph: 32000, efficiency: 88, changeoverMin: 18, status: "Доступен" },
  { id: "res-smt-2", name: "Линия SMT-2 · Hanwha S2", type: "Линия", workCenter: "SMT-монтаж", capacity: "1 партия / смена", baseCph: 28000, efficiency: 82, changeoverMin: 24, status: "Загружен" },
  { id: "res-aoi-offline", name: "Офлайн АОИ · Athena 10MP", type: "Инспектор", workCenter: "AOI-контроль", capacity: "2 партии / смена", baseCph: 0, efficiency: 92, changeoverMin: 8, status: "Доступен" },
  { id: "res-test", name: "Стенд функционального теста", type: "Стенд", workCenter: "Тестирование", capacity: "3 изделия / час", baseCph: 0, efficiency: 90, changeoverMin: 10, status: "Доступен" },
  { id: "res-manual-a", name: "Пост ручного монтажа A", type: "Рабочее место", workCenter: "Ручной монтаж", capacity: "2 оператора", baseCph: 0, efficiency: 80, changeoverMin: 5, status: "Доступен" },
];

const DEFAULT_BOM_LISTS = [];
const DEFAULT_SPECIFICATIONS = [];

const DEFAULT_EMPLOYEES = [
  { id: "emp-morozova", name: "Анна Морозова", roleId: "role-admin", role: "Планировщик", department: "Отдел программной подготовки изделий", shift: "День", password: "", status: "На смене" },
  { id: "emp-semenov", name: "Игорь Семенов", roleId: "role-planner", role: "Мастер THT", department: "THT отдел", shift: "День", password: "", status: "На смене" },
  { id: "emp-volkova", name: "Мария Волкова", roleId: "role-engineer", role: "Инженер ОТК", department: "ОТК / Испытания", shift: "День", password: "", status: "Доступна" },
  { id: "emp-kim", name: "Павел Ким", roleId: "role-operator", role: "Оператор SMT", department: "SMT отдел", shift: "Ночь", password: "", status: "Резерв" },
];

const DEFAULT_EQUIPMENT = [
  { id: "eq-smt1-loader", name: "Загрузчик LDC 460XL", inventory: "SMT1-01", workCenter: "SMT-1", maintenance: "12.06.2026", status: "Работает" },
  { id: "eq-smt1-inspect-conveyor", name: "Конвейер инспекционный CYB 460XL-600", inventory: "SMT1-02", workCenter: "SMT-1", maintenance: "12.06.2026", status: "Работает" },
  { id: "eq-smt1-hanwha-s2", name: "Установщик Hanwha S2", inventory: "SMT1-03", workCenter: "SMT-1", maintenance: "15.06.2026", status: "Работает" },
  { id: "eq-smt1-hanwha-l2", name: "Установщик Hanwha L2", inventory: "SMT1-04", workCenter: "SMT-1", maintenance: "15.06.2026", status: "Работает" },
  { id: "eq-smt1-conveyor", name: "Конвейер CYB 460XL-600", inventory: "SMT1-05", workCenter: "SMT-1", maintenance: "12.06.2026", status: "Работает" },
  { id: "eq-smt1-oven", name: "Печь JTR-800", inventory: "SMT1-06", workCenter: "SMT-1", maintenance: "18.06.2026", status: "Работает" },
  { id: "eq-smt2-manual-feed", name: "Стол ручной подачи ПП", inventory: "SMT2-01", workCenter: "SMT-2", maintenance: "12.06.2026", status: "Работает" },
  { id: "eq-smt2-conveyor", name: "Конвейер CYB 460XL-600", inventory: "SMT2-02", workCenter: "SMT-2", maintenance: "12.06.2026", status: "Работает" },
  { id: "eq-smt2-hanwha-s2", name: "Установщик Hanwha S2", inventory: "SMT2-03", workCenter: "SMT-2", maintenance: "16.06.2026", status: "Работает" },
  { id: "eq-smt2-oven", name: "Печь NoName", inventory: "SMT2-04", workCenter: "SMT-2", maintenance: "18.06.2026", status: "Проверка" },
  { id: "eq-smt2-aoi", name: "АОИ QUICK A300T", inventory: "SMT2-05", workCenter: "SMT-2", maintenance: "18.06.2026", status: "Работает" },
  { id: "eq-aoi-athena", name: "Линейная система АОИ 3D Athena 10MP", inventory: "AOI-OFF-01", workCenter: "Офлайн АОИ", maintenance: "20.06.2026", status: "Работает" },
  { id: "eq-cleaner", name: "Aqueous Cleaner 600", inventory: "EQ-021", workCenter: "Отмывка", maintenance: "05.06.2026", status: "Проверка" },
  { id: "eq-ict", name: "ICT-стенд T-900", inventory: "EQ-033", workCenter: "Тестирование", maintenance: "24.06.2026", status: "Работает" },
  { id: "eq-warehouse", name: "Зона приемки склада", inventory: "EQ-WH-01", workCenter: "Склад", maintenance: "01.07.2026", status: "Работает" },
];

const DEFAULT_NORMS = [
  { id: "norm-day", name: "Рабочая смена дневная", value: "08:00-20:00", scope: "Все подразделения", status: "Активен" },
  { id: "norm-night", name: "Рабочая смена ночная", value: "20:00-08:00", scope: "SMT / Тестирование", status: "Активен" },
  { id: "norm-buffer", name: "Буфер между операциями", value: "30 минут", scope: "Маршрутная карта", status: "Активен" },
  { id: "norm-capacity", name: "Емкость подразделения", value: "1 операция одновременно", scope: "Заказ на пр-во", status: "Активен" },
];

const DEFAULT_STATUSES = [
  ...PROJECT_STATUSES.map((status) => ({ id: `project-${status}`, name: PROJECT_STATUS_LABELS[status], type: "Спецификация", code: status, usage: "Карточка спецификации" })),
  ...SLOT_STATUSES.map((status) => ({ id: `slot-${status}`, name: STATUS_LABELS[status], type: "Операция", code: status, usage: "Слот Ганта" })),
];
const OPERATION_TYPE_OPTIONS = [
  { value: "production", label: "Производственная", meta: "изготовление или обработка" },
  { value: "warehouse", label: "Складская", meta: "приемка, выдача, отгрузка" },
  { value: "quality", label: "Контроль", meta: "проверка, испытания, AOI" },
  { value: "preparation", label: "Подготовительная", meta: "комплектация, наладка" },
  { value: "service", label: "Сервисная", meta: "вспомогательная работа" },
];
const BOM_IMPORT_COLUMN_COUNT = 9;
const MAIN_ROUTE_TASK_ID = "__main__";
const NOMENCLATURE_REA_COMPONENT_TYPE = "РЭА компоненты";
const DEFAULT_NOMENCLATURE_TYPES = [
  { id: "nom-type-rea", name: NOMENCLATURE_REA_COMPONENT_TYPE, code: "REA", description: "Резисторы, конденсаторы, микросхемы", status: "Активен" },
  { id: "nom-type-pcb", name: "Печатные платы", code: "PCB", description: "Голые платы и заготовки", status: "Активен" },
  { id: "nom-type-mech", name: "Механика", code: "MECH", description: "Корпуса, крепеж, радиаторы", status: "Активен" },
  { id: "nom-type-cable", name: "Кабели и жгуты", code: "CABLE", description: "Проводники, шлейфы, сборки", status: "Активен" },
  { id: "nom-type-consumable", name: "Расходные материалы", code: "CONS", description: "Паста, флюс, лак, химия", status: "Активен" },
  { id: "nom-type-pack", name: "Упаковка и маркировка", code: "PACK", description: "Коробки, этикетки, шильды", status: "Активен" },
  { id: "nom-type-buy", name: "Покупные изделия", code: "BUY", description: "Готовые узлы поставщика", status: "Активен" },
  { id: "nom-type-make", name: "Производимые узлы", code: "MAKE", description: "Сборочные единицы предприятия", status: "Активен" },
  { id: "nom-type-tooling", name: "Оснастка", code: "TOOL", description: "Трафареты, приспособления", status: "Активен" },
  { id: "nom-type-other", name: "Прочее", code: "OTHER", description: "Временный раздел", status: "Активен" },
];
const NOMENCLATURE_DEFAULT_TYPES = DEFAULT_NOMENCLATURE_TYPES.map((item) => ({
  value: item.name,
  label: item.name,
  meta: item.description,
}));
const BOM_IMPORT_FALLBACK_HEADERS = [
  "Порядковый номер",
  "Описание",
  "Обозначение в схеме",
  "Артикул производителя",
  "Производитель",
  "Корпус",
  "Кол-во",
  "Примечание",
  "Поле I",
];

const SYSTEM_AUTH_ROLE = {
  id: "system-admin",
  name: "Служебный администратор",
  code: "SYSTEM",
  accessLevel: 100,
  modules: "*",
  directories: "*",
  permissions: "create, read, update, delete, approve, reset, admin",
  status: "Активен",
};

const SYSTEM_AUTH_EMPLOYEE = {
  id: "system-admin",
  name: "Администратор",
  roleId: SYSTEM_AUTH_ROLE.id,
  role: "Служебный вход",
  department: "Система",
  shift: "-",
  password: "",
  status: "На смене",
};

let directoryEntityRemovalAllowed = false;
let planningEntityRemovalAllowed = false;
let directoryState = null;
let planningState = loadState();
directoryState = loadDirectoryState();
migrateDepartmentsToUnifiedWorkCenters();
migrateProjectEntityToSpecifications();
migrateSpecificationBomRowsToNomenclature();
syncNomenclatureTypesFromItems({ persist: true });
let calculatorState = loadCalculatorState();
let ui = loadUiState();
let authState = loadAuthState();
let updateCheckTimer = null;
let updateNoticeVersion = "";
let saveFeedbackTimer = null;
let saveUxRefreshTimer = null;
let pendingSaveFeedback = null;

const directorySections = [
  { id: "workCenters", label: "Подразделения", description: "Единый справочник оргподразделений, производственных зон и складов", count: () => planningState.workCenters.length },
  { id: "roles", label: "Роли", description: "Гибкая настройка доступа к модулям и справочникам", count: () => directoryState.roles.length },
  { id: "productionResources", label: "Производственные ресурсы", description: "Линии, станки, посты и оборудование", count: () => getProductionResources({ includeInactive: true }).length },
  { id: "componentTypes", label: "Типы компонентов", description: "Корпуса, коэффициенты и скорости установки", count: () => directoryState.componentTypes.length },
  { id: "nomenclatureTypes", label: "Типы номенклатуры", description: "Разделы, которые используются в модуле номенклатуры", count: () => directoryState.nomenclatureTypes.length },
  { id: "employees", label: "Сотрудники", description: "Планировщики, мастера, операторы", count: () => directoryState.employees.length },
  { id: "statuses", label: "Статусы", description: "Состояния спецификаций и операций", count: () => directoryState.statuses.length },
  { id: "norms", label: "Нормативы", description: "Смены, длительности и ограничения", count: () => directoryState.norms.length },
];

const directorySectionGroups = [
  {
    label: "Производство",
    description: "подразделения, мощности, оборудование",
    ids: ["workCenters", "productionResources", "norms"],
  },
  {
    label: "Система",
    description: "пользователи, права, статусы",
    ids: ["employees", "roles", "statuses"],
  },
  {
    label: "Технологии",
    description: "типы для BOM, SMT и номенклатуры",
    ids: ["componentTypes", "nomenclatureTypes"],
  },
];

const chartColors = ["#2563eb", "#0284c7", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#64748b"];

const statusReportColors = {
  planned: "#64748b",
  in_progress: "#2563eb",
  paused: "#64748b",
  completed: "#16a34a",
  overdue: "#dc2626",
  problem: "#d97706",
};

function handleDevResetParams() {
  const params = new URLSearchParams(window.location.search);
  let shouldReplaceUrl = false;

  if (params.has("state-reset")) {
    backupLocalStateBeforeReset();
    console.warn("[MES] state-reset ignored to protect saved BOM lists and specifications.");
    params.delete("state-reset");
    shouldReplaceUrl = true;
  }

  if (params.has("cache-reset")) {
    if ("caches" in window) {
      window.caches.keys()
        .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
        .catch(() => {});
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
    }
  }

  if (shouldReplaceUrl) {
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash || ""}`;
    window.history.replaceState(null, "", nextUrl);
  }
}

function backupLocalStateBeforeReset() {
  const values = Object.fromEntries(STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
  if (Object.values(values).every((value) => value === null)) return;
  localStorage.setItem(STATE_RESET_BACKUP_STORAGE_KEY, JSON.stringify({
    createdAt: new Date().toISOString(),
    version: APP_VERSION,
    url: window.location.href,
    values,
  }));
}

function createDefaultDirectoryState() {
  return {
    departments: DEFAULT_DEPARTMENTS,
    roles: DEFAULT_ROLES,
    productionResources: buildDefaultProductionResources(),
    resources: DEFAULT_RESOURCES,
    operationMap: [],
    nomenclatureTypes: DEFAULT_NOMENCLATURE_TYPES,
    nomenclature: [],
    bomLists: DEFAULT_BOM_LISTS,
    specifications: DEFAULT_SPECIFICATIONS,
    componentTypes: DEFAULT_COMPONENT_TYPES,
    employees: DEFAULT_EMPLOYEES,
    equipment: DEFAULT_EQUIPMENT,
    norms: DEFAULT_NORMS,
    statuses: DEFAULT_STATUSES,
  };
}

render();
startUpdateNotifier();
setInterval(() => {
  ui.now = new Date();
  updateClockOnly();
}, 30000);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const restored = restorePlanningStateFromBackups("missing-planning-storage");
      if (restored) return restored;
      return normalizePlanningState(createDefaultPlanningState());
    }
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) {
      const restored = restorePlanningStateFromBackups("invalid-planning-version");
      if (restored) return restored;
      return normalizePlanningState(createDefaultPlanningState());
    }
    return normalizePlanningState(parsed);
  } catch {
    const restored = restorePlanningStateFromBackups("broken-planning-storage");
    if (restored) return restored;
    return normalizePlanningState(createDefaultPlanningState());
  }
}

function persistState() {
  const previousRaw = localStorage.getItem(STORAGE_KEY);
  const previousState = parsePlanningStateSnapshot(previousRaw);
  if (previousRaw) backupRawPlanningState("before-planning-persist", previousRaw);
  if (previousState && !planningEntityRemovalAllowed) {
    planningState = preserveCriticalPlanningEntities(previousState, planningState);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(planningState));
}

function parsePlanningStateSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function backupRawPlanningState(reason, raw = localStorage.getItem(STORAGE_KEY)) {
  if (!raw) return;
  try {
    const currentHistory = JSON.parse(localStorage.getItem(PLANNING_BACKUP_STORAGE_KEY) || "[]");
    const history = Array.isArray(currentHistory) ? currentHistory : [];
    history.unshift({
      createdAt: new Date().toISOString(),
      reason,
      version: APP_VERSION,
      raw,
    });
    localStorage.setItem(PLANNING_BACKUP_STORAGE_KEY, JSON.stringify(history.slice(0, 12)));
  } catch {
    localStorage.setItem(PLANNING_BACKUP_STORAGE_KEY, JSON.stringify([{
      createdAt: new Date().toISOString(),
      reason,
      version: APP_VERSION,
      raw,
    }]));
  }
}

function collectPlanningRecoverySnapshots() {
  const snapshots = [];
  try {
    const history = JSON.parse(localStorage.getItem(PLANNING_BACKUP_STORAGE_KEY) || "[]");
    if (Array.isArray(history)) {
      history.forEach((entry) => {
        const parsed = parsePlanningStateSnapshot(entry?.raw);
        if (!parsed) return;
        snapshots.push({
          state: parsed,
          reason: entry.reason || "planning-backup",
          createdAt: entry.createdAt || "",
        });
      });
    }
  } catch {}

  try {
    const resetBackup = JSON.parse(localStorage.getItem(STATE_RESET_BACKUP_STORAGE_KEY) || "null");
    const raw = resetBackup?.values?.[STORAGE_KEY];
    const parsed = parsePlanningStateSnapshot(raw);
    if (parsed) {
      snapshots.push({
        state: parsed,
        reason: "state-reset-backup",
        createdAt: resetBackup.createdAt || "",
      });
    }
  } catch {}

  return snapshots;
}

function getCriticalPlanningCounts(state) {
  return {
    routes: Array.isArray(state?.routes) ? state.routes.length : 0,
    routeSteps: Array.isArray(state?.routeSteps) ? state.routeSteps.length : 0,
    batches: Array.isArray(state?.batches) ? state.batches.length : 0,
    slots: Array.isArray(state?.slots) ? state.slots.length : 0,
  };
}

function getPlanningRecoveryScore(snapshot) {
  const counts = getCriticalPlanningCounts(snapshot?.state);
  return counts.routes * 10 + counts.routeSteps + counts.batches + counts.slots;
}

function restorePlanningStateFromBackups(reason) {
  const candidates = collectPlanningRecoverySnapshots()
    .filter((snapshot) => getPlanningRecoveryScore(snapshot) > 0)
    .sort((left, right) => (
      getPlanningRecoveryScore(right) - getPlanningRecoveryScore(left)
      || String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
    ));
  const best = candidates[0];
  if (!best) return null;

  const normalized = normalizePlanningState(best.state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  console.warn("[MES] Restored planning state from local backup.", {
    reason,
    source: best.reason,
    counts: getCriticalPlanningCounts(normalized),
  });
  return normalized;
}

function preserveCriticalPlanningEntities(previousState, nextState) {
  if (!previousState || !nextState) return nextState;
  const previousCounts = getCriticalPlanningCounts(previousState);
  const nextCounts = getCriticalPlanningCounts(nextState);
  let changed = false;
  const mergedState = { ...nextState };

  if (previousCounts.routes > 0 && nextCounts.routes === 0) {
    mergedState.routes = previousState.routes || [];
    changed = true;
  }
  if (previousCounts.routeSteps > 0 && nextCounts.routeSteps === 0) {
    mergedState.routeSteps = previousState.routeSteps || [];
    changed = true;
  }

  if (!changed) return nextState;

  console.warn("[MES] Prevented critical planning wipe before save.", {
    previousCounts,
    nextCounts,
    mergedCounts: getCriticalPlanningCounts(mergedState),
  });
  return mergedState;
}

function parseDirectoryStateSnapshot(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function backupRawDirectoryState(reason, raw = localStorage.getItem(DIRECTORY_STORAGE_KEY)) {
  if (!raw) return;
  try {
    const currentHistory = JSON.parse(localStorage.getItem(DIRECTORY_BACKUP_STORAGE_KEY) || "[]");
    const history = Array.isArray(currentHistory) ? currentHistory : [];
    history.unshift({
      createdAt: new Date().toISOString(),
      reason,
      version: APP_VERSION,
      raw,
    });
    localStorage.setItem(DIRECTORY_BACKUP_STORAGE_KEY, JSON.stringify(history.slice(0, 10)));
  } catch {
    localStorage.setItem(DIRECTORY_BACKUP_STORAGE_KEY, JSON.stringify([{
      createdAt: new Date().toISOString(),
      reason,
      version: APP_VERSION,
      raw,
    }]));
  }
}

function collectDirectoryRecoverySnapshots() {
  const snapshots = [];
  try {
    const history = JSON.parse(localStorage.getItem(DIRECTORY_BACKUP_STORAGE_KEY) || "[]");
    if (Array.isArray(history)) {
      history.forEach((entry) => {
        const parsed = parseDirectoryStateSnapshot(entry?.raw);
        if (!parsed) return;
        snapshots.push({
          state: parsed,
          reason: entry.reason || "directory-backup",
          createdAt: entry.createdAt || "",
        });
      });
    }
  } catch {}

  try {
    const resetBackup = JSON.parse(localStorage.getItem(STATE_RESET_BACKUP_STORAGE_KEY) || "null");
    const raw = resetBackup?.values?.[DIRECTORY_STORAGE_KEY];
    const parsed = parseDirectoryStateSnapshot(raw);
    if (parsed) {
      snapshots.push({
        state: parsed,
        reason: "state-reset-backup",
        createdAt: resetBackup.createdAt || "",
      });
    }
  } catch {}

  return snapshots;
}

function getDirectoryRecoveryScore(snapshot) {
  const counts = getCriticalDirectoryCounts(snapshot?.state);
  return counts.bomLists + counts.specifications;
}

function restoreDirectoryStateFromBackups(reason) {
  const candidates = collectDirectoryRecoverySnapshots()
    .filter((snapshot) => getDirectoryRecoveryScore(snapshot) > 0)
    .sort((left, right) => (
      getDirectoryRecoveryScore(right) - getDirectoryRecoveryScore(left)
      || String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
    ));
  const best = candidates[0];
  if (!best) return null;

  const normalized = omitDeletedCriticalDirectoryEntities(normalizeDirectoryState(best.state, { mergeFallback: false }));
  localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(normalized));
  localStorage.setItem(DIRECTORY_DEFAULTS_STORAGE_KEY, "1");
  console.warn("[MES] Restored directory state from local backup.", {
    reason,
    source: best.reason,
    counts: getCriticalDirectoryCounts(normalized),
  });
  return normalized;
}

function getCriticalDirectoryCounts(state) {
  return {
    bomLists: Array.isArray(state?.bomLists) ? state.bomLists.length : 0,
    specifications: Array.isArray(state?.specifications) ? state.specifications.length : 0,
  };
}

function getDirectoryRowTimestamp(row) {
  const candidates = [row?.updatedAt, row?.importedAt, row?.createdAt]
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  return candidates.length ? Math.max(...candidates) : 0;
}

function readDirectoryDeletedEntities() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIRECTORY_DELETED_ENTITIES_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDirectoryDeletedEntities(tombstones) {
  try {
    localStorage.setItem(DIRECTORY_DELETED_ENTITIES_STORAGE_KEY, JSON.stringify(tombstones));
  } catch {}
}

function recordDirectoryEntityDeletion(sectionId, rowId) {
  if (!CRITICAL_DIRECTORY_SECTION_IDS.includes(sectionId) || !rowId) return;
  const tombstones = readDirectoryDeletedEntities();
  tombstones[sectionId] = {
    ...(tombstones[sectionId] || {}),
    [rowId]: Date.now(),
  };
  writeDirectoryDeletedEntities(tombstones);
}

function wasDirectoryEntityDeletedAfter(sectionId, row) {
  const rowId = row?.id;
  if (!rowId) return false;
  const deletedAt = Number(readDirectoryDeletedEntities()?.[sectionId]?.[rowId] || 0);
  return deletedAt > 0 && deletedAt >= getDirectoryRowTimestamp(row);
}

function omitDeletedCriticalDirectoryEntities(state) {
  if (!state) return state;
  let changed = false;
  const nextState = { ...state };
  CRITICAL_DIRECTORY_SECTION_IDS.forEach((sectionId) => {
    const rows = Array.isArray(nextState[sectionId]) ? nextState[sectionId] : [];
    const filteredRows = rows.filter((row) => !wasDirectoryEntityDeletedAfter(sectionId, row));
    if (filteredRows.length !== rows.length) {
      nextState[sectionId] = filteredRows;
      changed = true;
    }
  });
  return changed ? nextState : state;
}

function mergeCriticalDirectorySection(sectionId, previousRows = [], nextRows = []) {
  const previousMaxTimestamp = previousRows.reduce((max, row) => Math.max(max, getDirectoryRowTimestamp(row)), 0);
  const merged = [];
  const indexById = new Map();
  let changed = false;

  const remember = (row) => {
    if (!row?.id) return;
    const existingIndex = indexById.get(row.id);
    if (existingIndex === undefined) {
      indexById.set(row.id, merged.length);
      merged.push(row);
      return;
    }
    if (getDirectoryRowTimestamp(row) > getDirectoryRowTimestamp(merged[existingIndex])) {
      merged[existingIndex] = row;
      changed = true;
    }
  };

  previousRows.forEach((row) => {
    if (wasDirectoryEntityDeletedAfter(sectionId, row)) {
      changed = true;
      return;
    }
    remember(row);
  });

  nextRows.forEach((row) => {
    if (!row?.id) return;
    if (wasDirectoryEntityDeletedAfter(sectionId, row)) {
      changed = true;
      return;
    }
    if (indexById.has(row.id)) {
      remember(row);
      return;
    }
    if (!previousRows.length || getDirectoryRowTimestamp(row) > previousMaxTimestamp) {
      remember(row);
      return;
    }
    changed = true;
  });

  if (merged.length !== nextRows.length) changed = true;
  return { rows: merged, changed };
}

function preserveCriticalDirectoryEntities(previousState, nextState) {
  if (!previousState || !nextState) return nextState;
  const mergedState = { ...nextState };
  const changedSections = [];

  CRITICAL_DIRECTORY_SECTION_IDS.forEach((sectionId) => {
    const previousRows = Array.isArray(previousState?.[sectionId]) ? previousState[sectionId] : [];
    const nextRows = Array.isArray(nextState?.[sectionId]) ? nextState[sectionId] : [];
    const merged = mergeCriticalDirectorySection(sectionId, previousRows, nextRows);
    if (merged.changed) {
      mergedState[sectionId] = merged.rows;
      changedSections.push(sectionId);
    }
  });

  if (!changedSections.length) return nextState;

  console.warn("[MES] Reconciled critical directory entities before save.", {
    changedSections,
    previousCounts: getCriticalDirectoryCounts(previousState),
    nextCounts: getCriticalDirectoryCounts(nextState),
    mergedCounts: getCriticalDirectoryCounts(mergedState),
  });

  return mergedState;
}

function withDirectoryEntityRemovalAllowed(callback) {
  const previousValue = directoryEntityRemovalAllowed;
  directoryEntityRemovalAllowed = true;
  try {
    return callback();
  } finally {
    directoryEntityRemovalAllowed = previousValue;
  }
}

function withPlanningEntityRemovalAllowed(callback) {
  const previousValue = planningEntityRemovalAllowed;
  planningEntityRemovalAllowed = true;
  try {
    return callback();
  } finally {
    planningEntityRemovalAllowed = previousValue;
  }
}

function loadDirectoryState() {
  try {
    const raw = localStorage.getItem(DIRECTORY_STORAGE_KEY);
    if (!raw) {
      const restored = restoreDirectoryStateFromBackups("missing-directory-storage");
      if (restored) return restored;
      const fallback = normalizeDirectoryState(createDefaultDirectoryState());
      localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(fallback));
      localStorage.setItem(DIRECTORY_DEFAULTS_STORAGE_KEY, "1");
      return fallback;
    }
    const shouldRestoreDefaults = localStorage.getItem(DIRECTORY_DEFAULTS_STORAGE_KEY) !== "1";
    const parsed = JSON.parse(raw);
    let normalized = preserveCriticalDirectoryEntities(
      parsed,
      normalizeDirectoryState(parsed, { mergeFallback: shouldRestoreDefaults }),
    );
    normalized = omitDeletedCriticalDirectoryEntities(normalized);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || shouldRestoreDefaults) {
      backupRawDirectoryState("before-directory-load-normalize", raw);
      localStorage.setItem(DIRECTORY_STORAGE_KEY, serialized);
    }
    localStorage.setItem(DIRECTORY_DEFAULTS_STORAGE_KEY, "1");
    return normalized;
  } catch {
    const restored = restoreDirectoryStateFromBackups("broken-directory-storage");
    if (restored) return restored;
    return createDefaultDirectoryState();
  }
}

function persistDirectoryState() {
  const previousRaw = localStorage.getItem(DIRECTORY_STORAGE_KEY);
  const previousState = parseDirectoryStateSnapshot(previousRaw);
  if (previousRaw) backupRawDirectoryState("before-directory-persist", previousRaw);
  if (previousState && !directoryEntityRemovalAllowed) {
    directoryState = preserveCriticalDirectoryEntities(previousState, directoryState);
  }
  directoryState = omitDeletedCriticalDirectoryEntities(directoryState);
  localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(directoryState));
}

function resolveProductionResourceType(value = "") {
  const text = normalizeLookupText(value);
  if (Object.keys(PRODUCTION_RESOURCE_TYPE_LABELS).includes(text)) return text;
  if (text.includes("линия")) return "line";
  if (text.includes("стан") || text.includes("установ") || text.includes("печ")) return "machine";
  if (text.includes("рабоч") || text.includes("мест")) return "workplace";
  if (text.includes("пост") || text.includes("стенд") || text.includes("инспектор")) return "post";
  if (text.includes("оснаст")) return "tool";
  if (text.includes("норматив")) return "normative";
  return "equipment";
}

function resolveWorkCenterIdFromName(value = "") {
  const normalized = normalizeLookupText(value);
  if (!normalized) return "";
  const direct = getWorkCenter(value);
  if (direct) return direct.id;
  const lineNumber = getSmtLineNumberFromText(value);
  if (lineNumber) return "smt";
  if (normalized.includes("офлайн") && (normalized.includes("аои") || normalized.includes("aoi"))) return "aoi";
  const exact = (getRuntimePlanningState()?.workCenters || []).find((center) => (
    normalizeLookupText(center.id) === normalized
    || normalizeLookupText(center.name) === normalized
    || normalizeLookupText(center.code) === normalized
    || (center.legacyDepartmentNames || []).some((name) => normalizeLookupText(name) === normalized)
  ));
  if (exact) return exact.id;
  if (normalized.includes("smt") || normalized.includes("смт")) return "smt";
  if (normalized.includes("aoi") || normalized.includes("аои") || normalized.includes("отк")) return "aoi";
  if (normalized.includes("отмыв")) return "wash";
  if (normalized.includes("руч") || normalized.includes("tht")) return "manual";
  if (normalized.includes("тест") || normalized.includes("испыт")) return "test";
  if (normalized.includes("лак")) return "coating";
  if (normalized.includes("слесар") || normalized.includes("механ")) return "mechanic";
  if (normalized.includes("сбор")) return "assembly";
  if (normalized.includes("склад")) return "warehouse";
  return "";
}

function getProductionResourceWorkCenterId(resource = {}) {
  return resource.workCenterId || resolveWorkCenterIdFromName(resource.workCenter || resource.line || resource.department || "");
}

function normalizeProductionResource(row = {}) {
  const workCenterId = getProductionResourceWorkCenterId(row) || "manual";
  const center = getWorkCenter(workCenterId);
  const type = resolveProductionResourceType(row.type || row.resourceType || row.kind || "");
  const isLegacyEquipment = row.sourceKind === "equipment";
  const participatesInPlanning = row.participatesInPlanning ?? row.planningStatus ?? (isLegacyEquipment ? "no" : "yes");
  const participatesInCalculation = row.participatesInCalculation ?? row.calculationStatus ?? (isLegacyEquipment ? "no" : "yes");

  return {
    ...row,
    id: row.id || makeId("res"),
    name: String(row.name || "Производственный ресурс").trim(),
    type,
    workCenterId,
    workCenter: center?.name || row.workCenter || "",
    parentResourceId: row.parentResourceId || "",
    inventory: String(row.inventory || "").trim(),
    maintenance: String(row.maintenance || "").trim(),
    capacity: String(row.capacity || "").trim(),
    baseCph: Math.max(0, Number(row.baseCph || 0)),
    efficiency: Math.max(0, Number(row.efficiency || 0)),
    changeoverMin: Math.max(0, Number(row.changeoverMin || 0)),
    participatesInPlanning: participatesInPlanning === true || participatesInPlanning === "yes" ? "yes" : "no",
    participatesInCalculation: participatesInCalculation === true || participatesInCalculation === "yes" ? "yes" : "no",
    sourceKind: row.sourceKind || "productionResource",
    status: String(row.status || "Доступен").trim(),
  };
}

function getSmtLineParentResourceId(value = "", resources = []) {
  const lineNumber = getSmtLineNumberFromText(value);
  if (!lineNumber) return "";
  const line = findSmtLineByNumber(lineNumber, resources);
  return line?.id || "";
}

function migrateLegacyResourceRow(row = {}) {
  return normalizeProductionResource({
    ...row,
    sourceKind: "resource",
    workCenterId: resolveWorkCenterIdFromName(row.workCenter),
    participatesInPlanning: "yes",
    participatesInCalculation: "yes",
  });
}

function migrateLegacyEquipmentRow(row = {}, migratedResources = []) {
  const parentResourceId = getSmtLineParentResourceId(row.workCenter, migratedResources);
  return normalizeProductionResource({
    ...row,
    type: row.type || "equipment",
    sourceKind: "equipment",
    workCenterId: resolveWorkCenterIdFromName(row.workCenter),
    parentResourceId,
    capacity: "",
    baseCph: 0,
    efficiency: 0,
    changeoverMin: 0,
    participatesInPlanning: "no",
    participatesInCalculation: "no",
  });
}

function dedupeProductionResources(rows = []) {
  const result = [];
  const seen = new Set();
  rows.forEach((row) => {
    const normalized = normalizeProductionResource(row);
    const key = normalized.id || `${normalizeLookupText(normalized.name)}::${normalized.workCenterId}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function buildDefaultProductionResources() {
  const migratedResources = DEFAULT_RESOURCES.map((row) => migrateLegacyResourceRow(row));
  const migratedEquipment = DEFAULT_EQUIPMENT.map((row) => migrateLegacyEquipmentRow(row, migratedResources));
  return dedupeProductionResources([...migratedResources, ...migratedEquipment]);
}

function getProductionResourceSourceRows(state = {}, fallbackRows = []) {
  const currentRows = Array.isArray(state?.productionResources) ? state.productionResources : [];
  const migratedResources = (Array.isArray(state?.resources) ? state.resources : []).map((row) => migrateLegacyResourceRow(row));
  const migratedEquipment = (Array.isArray(state?.equipment) ? state.equipment : []).map((row) => migrateLegacyEquipmentRow(row, [...currentRows, ...migratedResources]));
  const source = currentRows.length ? currentRows : fallbackRows;
  return dedupeProductionResources([...source, ...migratedResources, ...migratedEquipment]);
}

function getProductionResources({ includeInactive = false } = {}) {
  const rows = Array.isArray(directoryState?.productionResources)
    ? directoryState.productionResources
    : getProductionResourceSourceRows(directoryState, buildDefaultProductionResources());
  return dedupeProductionResources(rows)
    .filter((resource) => includeInactive || !["Отключен", "inactive"].includes(resource.status));
}

function getProductionResource(resourceId) {
  return getProductionResources({ includeInactive: true }).find((resource) => resource.id === resourceId) || null;
}

function resourceParticipatesInPlanning(resource = {}) {
  return resource.participatesInPlanning !== "no" && !["Отключен", "inactive"].includes(resource.status);
}

function resourceParticipatesInCalculation(resource = {}) {
  return resource.participatesInCalculation !== "no" && !["Отключен", "inactive"].includes(resource.status);
}

function getProductionResourcesForWorkCenter(workCenterId, { includeInactive = false, includePassive = false } = {}) {
  const resolvedId = getCalendarWorkCenterId(workCenterId);
  return getProductionResources({ includeInactive })
    .filter((resource) => getProductionResourceWorkCenterId(resource) === resolvedId)
    .filter((resource) => includePassive || resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource));
}

function makeFallbackProductionResource(workCenterId) {
  const center = getWorkCenter(workCenterId) || { id: workCenterId, name: "Подразделение", code: workCenterId };
  return normalizeProductionResource({
    id: `resource-${center.id}-norm`,
    name: `${center.name} · норматив`,
    type: "normative",
    workCenterId: center.id,
    workCenter: center.name,
    capacity: `${Number(center.unitsPerHour || getWorkCenterUnitsPerHour(center.id)).toLocaleString("ru-RU")} изд./час`,
    baseCph: center.id === "smt" ? DEFAULT_RESOURCE_CPH : 0,
    efficiency: 100,
    changeoverMin: 0,
    participatesInPlanning: "yes",
    participatesInCalculation: "yes",
    status: "Норматив",
  });
}

function normalizeUnitType(value, row = {}) {
  const raw = String(value || row.unitType || row.type || "").trim().toLowerCase();
  if (["production", "administrative", "warehouse", "quality", "service"].includes(raw)) return raw;
  const text = `${row.id || ""} ${row.name || ""} ${row.code || ""}`.toLowerCase();
  if (text.includes("warehouse") || text.includes("склад")) return "warehouse";
  if (text.includes("отк") || text.includes("aoi") || text.includes("аои") || text.includes("контроль") || text.includes("test")) return "quality";
  if (text.includes("план") || text.includes("закуп") || text.includes("снаб") || text.includes("программ")) return "administrative";
  return "production";
}

function isPlanningWorkCenter(center) {
  return Boolean(center) && center.isActive !== false && center.isPlanningUnit !== false && center.showInGantt !== false;
}

function getPlanningWorkCenters({ includeWarehouse = true } = {}) {
  return (planningState.workCenters || [])
    .filter((center) => isPlanningWorkCenter(center))
    .filter((center) => includeWarehouse || center.id !== "warehouse");
}

function normalizeWorkCenterUnit(center = {}) {
  const migratedName = LEGACY_WORK_CENTER_NAME_MIGRATION[center.name] || center.name;
  const unitType = normalizeUnitType(center.unitType, center);
  const isWarehouse = center.id === "warehouse" || unitType === "warehouse";
  const isAdministrative = unitType === "administrative";
  const isPlanningUnit = center.isPlanningUnit === undefined
    ? !isAdministrative
    : Boolean(center.isPlanningUnit);
  const showInGantt = center.showInGantt === undefined ? isPlanningUnit : Boolean(center.showInGantt);
  const unitsPerHour = isPlanningUnit
    ? Math.max(1, Number(center.unitsPerHour || WORK_CENTER_RATES[center.id] || 40))
    : Math.max(0, Number(center.unitsPerHour || 0));
  const capacity = isPlanningUnit
    ? Math.max(1, Number(center.capacity || 1))
    : Math.max(0, Number(center.capacity || 0));

  return {
    ...center,
    name: migratedName,
    unitType,
    owner: String(center.owner || "").trim(),
    isPlanningUnit,
    showInGantt,
    unitsPerHour,
    capacity,
    shift: center.shift || (isWarehouse ? "24/7" : isPlanningUnit ? "5/2 08:00-20:00" : ""),
    isActive: center.isActive !== false,
  };
}

function getLegacyDepartmentTargetCenterId(departmentName = "") {
  const direct = LEGACY_DEPARTMENT_TO_WORK_CENTER_ID[departmentName];
  if (direct) return direct;
  const normalized = normalizeLookupText(EMPLOYEE_DEPARTMENT_MIGRATION[departmentName] || departmentName);
  const exact = (planningState.workCenters || []).find((center) => (
    normalizeLookupText(center.name) === normalized
    || normalizeLookupText(center.code) === normalized
  ));
  if (exact) return exact.id;
  return "";
}

function getUnifiedUnitName(name = "") {
  const migratedName = LEGACY_WORK_CENTER_NAME_MIGRATION[EMPLOYEE_DEPARTMENT_MIGRATION[name] || name] || EMPLOYEE_DEPARTMENT_MIGRATION[name] || name;
  const targetId = getLegacyDepartmentTargetCenterId(migratedName);
  const target = targetId ? getWorkCenter(targetId) : null;
  if (target?.name) return target.name;
  return migratedName;
}

function migrateSpecificationDepartmentNames(renameMap) {
  if (!renameMap.size) return false;
  let changed = false;
  directoryState.specifications = (directoryState.specifications || []).map((specification) => {
    let specificationChanged = false;
    const nextItems = getSpecificationStructureItems(specification).map((item) => {
      const nextDepartmentName = renameMap.get(item.departmentName) || item.departmentName;
      if (nextDepartmentName === item.departmentName) return item;
      specificationChanged = true;
      return { ...item, departmentName: nextDepartmentName };
    });
    if (!specificationChanged) return specification;
    changed = true;
    return { ...specification, structureItems: nextItems };
  });
  return changed;
}

function migrateDepartmentsToUnifiedWorkCenters() {
  if (!planningState || !directoryState) return;
  const legacyDepartments = Array.isArray(directoryState.departments) ? directoryState.departments : [];
  const renameMap = new Map();
  let planningChanged = false;
  let directoryChanged = false;

  planningState.workCenters = (planningState.workCenters || []).map((center) => {
    const normalizedCenter = normalizeWorkCenterUnit(center);
    if (center.name && normalizedCenter.name !== center.name) {
      renameMap.set(center.name, normalizedCenter.name);
      planningChanged = true;
    }
    return normalizedCenter;
  });

  legacyDepartments.forEach((department) => {
    if (!department?.name) return;
    const targetId = getLegacyDepartmentTargetCenterId(department.name);
    const targetIndex = targetId
      ? planningState.workCenters.findIndex((center) => center.id === targetId)
      : -1;

    if (targetIndex >= 0) {
      const target = planningState.workCenters[targetIndex];
      renameMap.set(department.name, target.name);
      planningState.workCenters[targetIndex] = normalizeWorkCenterUnit({
        ...target,
        owner: target.owner || department.owner || "",
        legacyDepartmentNames: [...new Set([...(target.legacyDepartmentNames || []), department.name])],
      });
      planningChanged = true;
      return;
    }

    const unitIdBase = String(department.id || makeId("unit")).replace(/^dep-/, "unit-");
    let unitId = unitIdBase || makeId("unit");
    let suffix = 1;
    while (planningState.workCenters.some((center) => center.id === unitId)) {
      suffix += 1;
      unitId = `${unitIdBase}-${suffix}`;
    }
    planningState.workCenters.push(normalizeWorkCenterUnit({
      id: unitId,
      name: department.name,
      code: department.code || "UNIT",
      unitType: normalizeUnitType("", department),
      owner: department.owner || "",
      isPlanningUnit: false,
      showInGantt: false,
      unitsPerHour: 0,
      capacity: 0,
      shift: "",
      description: "Мигрировано из прежнего справочника подразделений.",
      isActive: department.status !== "Отключен",
    }));
    planningChanged = true;
  });

  directoryState.employees = (directoryState.employees || []).map((employee) => {
    const nextDepartment = getUnifiedUnitName(employee.department);
    if (nextDepartment === employee.department) return employee;
    directoryChanged = true;
    return { ...employee, department: nextDepartment };
  });

  if (migrateSpecificationDepartmentNames(renameMap)) directoryChanged = true;

  if (legacyDepartments.length) {
    directoryState.departments = [];
    directoryChanged = true;
  }

  planningState = normalizePlanningState(planningState);
  if (planningChanged) persistState();
  if (directoryChanged) persistDirectoryState();
}

function migrateProjectEntityToSpecifications() {
  // Legacy migration only. "Project" is no longer a business entity; old
  // projectId fields are kept as aliases for specificationId in saved Gantt data.
  if (!planningState || !directoryState) return;

  const legacyProjects = Array.isArray(planningState.projects) ? planningState.projects : [];
  const legacyProjectById = byId(legacyProjects);
  const specifications = Array.isArray(directoryState.specifications) ? directoryState.specifications : [];
  const projectToSpecificationId = new Map();
  let changed = false;

  specifications.forEach((specification) => {
    if (specification.projectId) projectToSpecificationId.set(specification.projectId, specification.id);
    projectToSpecificationId.set(specification.id, specification.id);
  });

  const nextSpecifications = [...specifications];
  legacyProjects.forEach((project) => {
    let specificationId = projectToSpecificationId.get(project.id);
    const legacySuffix = String(project.id || "").replace(/^p-/, "");
    const derivedSpecificationId = legacySuffix ? `spec-${legacySuffix}` : "";
    if (!specificationId && nextSpecifications.some((specification) => specification.id === derivedSpecificationId)) {
      specificationId = derivedSpecificationId;
      projectToSpecificationId.set(project.id, specificationId);
      changed = true;
    }
    if (!specificationId) {
      specificationId = derivedSpecificationId || `spec-${makeId("legacy")}`;
      let uniqueId = specificationId;
      let suffix = 1;
      while (nextSpecifications.some((specification) => specification.id === uniqueId)) {
        suffix += 1;
        uniqueId = `${specificationId}-${suffix}`;
      }
      specificationId = uniqueId;
      nextSpecifications.push({
        id: specificationId,
        name: project.name || `Спецификация ${project.orderNumber || project.id}`,
        outputItem: project.name || "",
        bomListA: "",
        bomQtyA: 0,
        bomListB: "",
        bomQtyB: 0,
        extraItems: "",
        status: "Активен",
        structureManaged: true,
        structureItems: [],
        createdAt: project.createdAt || new Date().toISOString(),
      });
      projectToSpecificationId.set(project.id, specificationId);
      changed = true;
    }
  });

  const stamp = new Date().toISOString();
  directoryState.specifications = nextSpecifications.map((specification) => {
    const legacyProject = specification.projectId ? legacyProjectById[specification.projectId] : null;
    const next = {
      ...specification,
      projectId: "",
      productionQuantity: normalizeOptionalPositiveInteger(specification.productionQuantity || legacyProject?.totalQuantity) || "",
      dueDate: specification.dueDate || legacyProject?.dueDate || "",
      orderNumber: specification.orderNumber || legacyProject?.orderNumber || "",
      customer: specification.customer || legacyProject?.customer || "",
      productionStatus: PROJECT_STATUSES.includes(specification.productionStatus || legacyProject?.status)
        ? specification.productionStatus || legacyProject?.status
        : "planned",
      updatedAt: specification.updatedAt || legacyProject?.updatedAt || stamp,
    };
    if (specification.projectId || legacyProject) changed = true;
    const synced = syncSpecificationDerivedFields(next);
    if (JSON.stringify(synced) !== JSON.stringify(specification)) changed = true;
    return synced;
  });

  directoryState.bomLists = (directoryState.bomLists || []).map((bom) => {
    if (!bom.projectId) return bom;
    changed = true;
    return { ...bom, projectId: "" };
  });

  const routeByLegacyProjectId = new Map((planningState.routes || [])
    .filter((route) => route.projectId)
    .map((route) => [route.projectId, route]));
  const routeById = new Map();

  planningState.routes = (planningState.routes || []).map((route) => {
    const specificationId = route.specificationId
      || projectToSpecificationId.get(route.projectId)
      || (getSpecificationById(route.projectId) ? route.projectId : "");
    if (route.specificationId === specificationId && route.projectId === specificationId) {
      routeById.set(route.id, route);
      return route;
    }
    changed = true;
    const specification = getSpecificationById(specificationId);
    const nextRoute = {
      ...route,
      specificationId,
      specificationName: specification?.name || route.specificationName || "",
      projectId: specificationId || route.projectId || "",
      updatedAt: route.updatedAt || stamp,
    };
    routeById.set(nextRoute.id, nextRoute);
    return nextRoute;
  });

  const routeByLegacyAfterMigration = new Map((planningState.routes || [])
    .map((route) => [route.projectId, route]));

  planningState.batches = (planningState.batches || []).map((batch) => {
    const route = routeById.get(batch.routeId)
      || routeByLegacyProjectId.get(batch.projectId)
      || routeByLegacyAfterMigration.get(projectToSpecificationId.get(batch.projectId) || batch.projectId);
    const specificationId = batch.specificationId
      || route?.specificationId
      || projectToSpecificationId.get(batch.projectId)
      || (getSpecificationById(batch.projectId) ? batch.projectId : "");
    if (batch.routeId === route?.id && batch.specificationId === specificationId && batch.projectId === specificationId) return batch;
    changed = true;
    return {
      ...batch,
      routeId: route?.id || batch.routeId || "",
      specificationId,
      projectId: specificationId || batch.projectId || "",
      updatedAt: batch.updatedAt || stamp,
    };
  });

  const routeByStepId = new Map((planningState.routeSteps || []).map((step) => [step.id, routeById.get(step.routeId)]));
  planningState.slots = (planningState.slots || []).map((slot) => {
    const route = routeByStepId.get(slot.routeStepId)
      || routeById.get(slot.routeId)
      || routeByLegacyProjectId.get(slot.projectId)
      || routeByLegacyAfterMigration.get(projectToSpecificationId.get(slot.projectId) || slot.projectId);
    const specificationId = slot.specificationId
      || route?.specificationId
      || projectToSpecificationId.get(slot.projectId)
      || (getSpecificationById(slot.projectId) ? slot.projectId : "");
    if (slot.routeId === route?.id && slot.specificationId === specificationId && slot.projectId === specificationId) return slot;
    changed = true;
    return {
      ...slot,
      routeId: route?.id || slot.routeId || "",
      specificationId,
      projectId: specificationId || slot.projectId || "",
      updatedAt: slot.updatedAt || stamp,
    };
  });

  if (planningState.projects?.length) {
    planningState.projects = [];
    changed = true;
  } else {
    planningState.projects = [];
  }

  planningState = normalizePlanningState(planningState);
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });

  if (changed) {
    persistState();
    persistDirectoryState();
  }
}

function loadCalculatorState() {
  try {
    const raw = localStorage.getItem(CALCULATOR_STORAGE_KEY);
    if (!raw) return createDefaultCalculatorState();
    return normalizeCalculatorState(JSON.parse(raw));
  } catch {
    return createDefaultCalculatorState();
  }
}

function persistCalculatorState() {
  localStorage.setItem(CALCULATOR_STORAGE_KEY, JSON.stringify(calculatorState));
}

function loadAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { employeeId: "", loggedInAt: "" };
    const parsed = JSON.parse(raw);
    return {
      employeeId: String(parsed?.employeeId || ""),
      loggedInAt: String(parsed?.loggedInAt || ""),
    };
  } catch {
    return { employeeId: "", loggedInAt: "" };
  }
}

function persistAuthState() {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
}

function notifySaveSuccess(message = "Сохранено") {
  pendingSaveFeedback = {
    message: String(message || "Сохранено"),
    createdAt: Date.now(),
  };
  window.clearTimeout(saveFeedbackTimer);
  window.setTimeout(renderPendingSaveFeedback, 0);
}

function renderPendingSaveFeedback() {
  document.querySelectorAll(".global-save-toast").forEach((element) => element.remove());
  if (!pendingSaveFeedback) return;
  window.clearTimeout(saveFeedbackTimer);

  const toast = document.createElement("div");
  toast.className = "global-save-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.innerHTML = `${icon("check")}<span>${escapeHtml(pendingSaveFeedback.message)}</span>`;
  document.body.appendChild(toast);

  saveFeedbackTimer = window.setTimeout(() => {
    toast.classList.add("is-hiding");
    window.setTimeout(() => toast.remove(), 180);
    pendingSaveFeedback = null;
  }, 2600);
}

function scheduleGlobalSaveUxRefresh() {
  window.clearTimeout(saveUxRefreshTimer);
  saveUxRefreshTimer = window.setTimeout(() => {
    bindGlobalFormDirtyTracking();
    renderPendingSaveFeedback();
  }, 0);
}

function getFormControlSignatureEntry(control) {
  if (!control?.name || control.disabled) return null;
  const type = String(control.type || "").toLowerCase();
  if (["button", "submit", "reset", "file"].includes(type)) return null;
  if (type === "checkbox" || type === "radio") {
    return [control.name, control.checked ? String(control.value || "on") : ""];
  }
  if (control.tagName === "SELECT" && control.multiple) {
    return [control.name, [...control.selectedOptions].map((option) => option.value).join("|")];
  }
  return [control.name, String(control.value ?? "")];
}

function getFormSignature(form) {
  return JSON.stringify([...form.elements]
    .map((control) => getFormControlSignatureEntry(control))
    .filter(Boolean)
    .sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
}

function isUnsavedCreateForm(form) {
  const isNewValue = form.querySelector('[name="isNew"]')?.value;
  const rowIndexValue = form.querySelector('[name="rowIndex"]')?.value;
  if (isNewValue === "yes" || rowIndexValue === "-1") return true;
  if (form.id === "slotForm" && !form.querySelector('[name="slotId"]')?.value) return true;
  return ["splitForm", "projectForm"].includes(form.id);
}

function setSaveButtonDisabled(button, disabled) {
  if (!button) return;
  if (!Object.prototype.hasOwnProperty.call(button.dataset, "saveOriginalTitle")) {
    button.dataset.saveOriginalTitle = button.getAttribute("title") || "";
  }
  button.toggleAttribute("disabled", Boolean(disabled));
  button.classList.toggle("is-save-disabled", Boolean(disabled));
  if (disabled) {
    button.setAttribute("title", "Измените данные, чтобы сохранить");
    return;
  }
  if (button.dataset.saveOriginalTitle) {
    button.setAttribute("title", button.dataset.saveOriginalTitle);
  } else {
    button.removeAttribute("title");
  }
}

function bindGlobalFormDirtyTracking() {
  app.querySelectorAll("form").forEach((form) => {
    if (form.id === "authForm") return;
    const saveButtons = [...form.querySelectorAll('button[type="submit"], input[type="submit"]')];
    if (!saveButtons.length) return;
    form.dataset.initialSaveSignature = getFormSignature(form);

    const syncDirtyState = () => {
      const isDirty = isUnsavedCreateForm(form) || getFormSignature(form) !== form.dataset.initialSaveSignature;
      form.classList.toggle("is-dirty", isDirty);
      saveButtons.forEach((button) => setSaveButtonDisabled(button, !isDirty));
    };
    const guardCleanSubmit = (event) => {
      if (isUnsavedCreateForm(form)) return;
      if (getFormSignature(form) !== form.dataset.initialSaveSignature) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    if (!form.dataset.saveUxBound) {
      form.addEventListener("input", syncDirtyState);
      form.addEventListener("change", syncDirtyState);
      form.addEventListener("submit", guardCleanSubmit, true);
      form.dataset.saveUxBound = "yes";
    }
    syncDirtyState();
  });
}

function createDefaultCalculatorState() {
  return normalizeCalculatorState({
    ...defaultCalculatorState,
    componentCounts: {},
  });
}

function normalizeCalculatorState(state) {
  const project = getProject(state?.projectId || state?.specificationId) || null;
  const noSpecification = Boolean(state?.noSpecification);
  const specification = noSpecification ? null : directoryState?.specifications?.find((item) => item.id === state?.specificationId) || null;
  const bomList = directoryState?.bomLists?.find((item) => item.id === state?.bomListId) || null;
  const boardQuantity = normalizeOptionalPositiveInteger(state?.boardQuantity);
  const boardsPerPanel = normalizeOptionalPositiveInteger(state?.boardsPerPanel);
  const routeOperations = (Array.isArray(state?.routeOperations) ? state.routeOperations : [])
    .map((operation, index) => normalizeRouteOperation(operation, index + 1, boardsPerPanel || 1));
  const selectedOperationId = routeOperations.some((operation) => operation.id === state?.selectedOperationId)
    ? state.selectedOperationId
    : routeOperations[0]?.id || "";
  const componentCountsByOperation = {
    ...(state?.componentCountsByOperation || {}),
  };
  for (const operation of routeOperations) {
    if (operation.calculationType === "components" && !componentCountsByOperation[operation.id]) {
      const operationBom = getBomList(operation.bomListId) || bomList;
      componentCountsByOperation[operation.id] = {
        ...(operationBom ? getBomComponentCounts(operationBom) : {}),
        ...(state?.componentCounts || {}),
      };
    }
  }

  return {
    ...defaultCalculatorState,
    ...state,
    projectId: project?.id || "",
    noSpecification,
    specificationId: noSpecification ? "" : specification?.id || "",
    bomListId: bomList?.id || "",
    selectedOperationId,
    routeOperations,
    boardQuantity,
    boardsPerPanel,
    efficiency: Math.max(10, Math.min(150, Number(state?.efficiency || defaultCalculatorState.efficiency))),
    componentCounts: {
      ...(bomList ? getBomComponentCounts(bomList) : {}),
      ...(state?.componentCounts || {}),
    },
    componentCountsByOperation,
    lastSavedAt: String(state?.lastSavedAt || ""),
    inputsSavedAt: String(state?.inputsSavedAt || ""),
    inputsSavedSignature: String(state?.inputsSavedSignature || ""),
    routeSavedSignature: String(state?.routeSavedSignature || ""),
  };
}

function normalizeOptionalPositiveInteger(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number <= 0) return "";
  return number;
}

function loadUiState() {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return { ...defaultUiState, expandedProjects: new Set(defaultUiState.expandedProjects) };
    const parsed = JSON.parse(raw);
    return {
      ...defaultUiState,
      ...parsed,
      expandedProjects: new Set(parsed.expandedProjects || defaultUiState.expandedProjects),
      selectedDirectoryRows: parsed.selectedDirectoryRows || {},
      spekiStaleItemIds: Array.isArray(parsed.spekiStaleItemIds) ? parsed.spekiStaleItemIds : [],
      spekiCollapsedBomIds: Array.isArray(parsed.spekiCollapsedBomIds) ? parsed.spekiCollapsedBomIds : [],
      directoryEditor: null,
      confirmDialog: null,
      selectedSlotId: null,
      editor: null,
      splitSlotId: null,
      projectModal: false,
      drag: null,
      timelineCounts: {
        ...defaultUiState.timelineCounts,
        ...(parsed.timelineCounts || {}),
      },
      ganttZoom: normalizeGanttZoom(parsed.ganttZoom),
      ganttSlotContent: normalizeGanttSlotContent(parsed.ganttSlotContent),
      now: new Date(),
    };
  } catch {
    return { ...defaultUiState, expandedProjects: new Set(defaultUiState.expandedProjects) };
  }
}

function persistUiState() {
  const shell = app.querySelector("[data-gantt-shell]");
  if (shell) {
    ui.scrollLeft = shell.scrollLeft;
    ui.scrollTop = shell.scrollTop;
  }

  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({
      activeModule: ui.activeModule,
      activeDirectory: ui.activeDirectory,
      activeProjectId: ui.activeProjectId,
      activeSpecificationId: ui.activeSpecificationId,
      spekiEditingId: ui.spekiEditingId,
      spekiCheckedSpecificationId: ui.spekiCheckedSpecificationId,
      spekiStaleItemIds: ui.spekiStaleItemIds,
      spekiCollapsedBomIds: ui.spekiCollapsedBomIds,
      activeBomId: ui.activeBomId,
      activeNomenclatureId: ui.activeNomenclatureId,
      activeOperationId: ui.activeOperationId,
      activeRouteId: ui.activeRouteId,
      calculatorStep: ui.calculatorStep,
      selectedDirectoryRows: ui.selectedDirectoryRows,
    scale: ui.scale,
    windowStart: ui.windowStart,
    search: ui.search,
    statusFilter: ui.statusFilter,
    workCenterFilter: ui.workCenterFilter,
    rowMode: ui.rowMode,
    autoCascade: ui.autoCascade,
    ganttZoom: ui.ganttZoom,
    ganttSlotContent: ui.ganttSlotContent,
    timelineCounts: ui.timelineCounts,
    expandedProjects: [...ui.expandedProjects],
    scrollLeft: ui.scrollLeft,
    scrollTop: ui.scrollTop,
  }));
}

function normalizeDirectoryState(state, options = {}) {
  const fallback = createDefaultDirectoryState();
  const mergeFallback = options.mergeFallback !== false;
  return Object.fromEntries(Object.entries(fallback).map(([sectionId, fallbackRows]) => {
    const sourceRows = sectionId === "productionResources"
      ? getProductionResourceSourceRows(state, fallbackRows)
      : Array.isArray(state?.[sectionId]) ? state[sectionId] : fallbackRows;
    const sourceIds = new Set(sourceRows.map((row) => row?.id).filter(Boolean));
    const rows = [
      ...sourceRows,
      ...(mergeFallback ? fallbackRows.filter((row) => row?.id && !sourceIds.has(row.id)) : []),
    ];
    return [sectionId, rows
      .filter((row) => !OBSOLETE_DIRECTORY_ROW_IDS[sectionId]?.has(row?.id))
      .filter((row) => shouldKeepDirectoryRow(sectionId, row))
      .map((row, index) => normalizeDirectoryRow(sectionId, {
        ...(fallbackRows.find((fallbackRow) => fallbackRow.id === row.id) || fallbackRows[index]),
        ...row,
        id: row.id || fallbackRows[index]?.id || `${sectionId}-${index + 1}`,
      }))];
  }));
}

function normalizeDirectoryRow(sectionId, row) {
  if (sectionId === "departments") {
    return {
      ...row,
      name: String(row.name || "").trim(),
      code: String(row.code || "").trim(),
      owner: String(row.owner || "").trim(),
      status: String(row.status || "Активен").trim(),
    };
  }

  if (sectionId === "productionResources") {
    return normalizeProductionResource(row);
  }

  if (sectionId === "bomLists") {
    const { revision, boardsPerPanel, ...rowWithoutRevision } = row || {};
    const importHeaders = Array.isArray(row.importHeaders) ? row.importHeaders : [];
    const importRows = Array.isArray(row.importRows) ? row.importRows : Array.isArray(row.items) ? row.items : [];
    return {
      ...rowWithoutRevision,
      projectId: row.projectId || "",
      importHeaders,
      importRows: importRows.map((item) => normalizeBomImportRow(item)),
      importedAt: row.importedAt || "",
      sourceFileName: row.sourceFileName || "",
      sourceSheetName: row.sourceSheetName || "",
      ...Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, Math.max(0, Math.round(Number(row[field.key] || 0)))])),
    };
  }

  if (sectionId === "nomenclature") {
    return {
      ...row,
      name: String(row.name || "").trim(),
      article: String(row.article || row.code || "").trim(),
      type: normalizeNomenclatureType(row.type),
      package: String(row.package || "").trim(),
      unit: String(row.unit || "шт.").trim(),
      manufacturer: String(row.manufacturer || "").trim(),
      description: String(row.description || "").trim(),
      status: String(row.status || "Активен").trim(),
    };
  }

  if (sectionId === "operationMap") {
    const type = OPERATION_TYPE_OPTIONS.some((item) => item.value === row.type)
      ? row.type
      : row.isWarehouse
        ? "warehouse"
        : "production";
    const fallbackCenterId = type === "warehouse" ? "warehouse" : planningState?.workCenters?.find((center) => center.id !== "warehouse")?.id || "smt";
    return {
      ...row,
      name: String(row.name || row.operationName || "").trim(),
      code: String(row.code || "").trim(),
      type,
      workCenterId: String(row.workCenterId || fallbackCenterId),
      unitsPerHour: Math.max(0, Math.round(Number(row.unitsPerHour || row.rate || 0) * 10) / 10),
      requiresBatch: row.requiresBatch === undefined ? type !== "warehouse" : Boolean(row.requiresBatch),
      isWarehouse: type === "warehouse" || Boolean(row.isWarehouse),
      status: String(row.status || "Активен").trim(),
      updatedAt: row.updatedAt || "",
    };
  }

  if (sectionId === "nomenclatureTypes") {
    const name = normalizeNomenclatureType(row.name || row.value || row.label);
    return {
      ...row,
      name,
      code: String(row.code || "").trim(),
      description: String(row.description || row.meta || "").trim(),
      status: String(row.status || "Активен").trim(),
    };
  }

  if (sectionId === "specifications") {
    const { revision, ...rowWithoutRevision } = row || {};
    const linkedProject = planningState?.projects?.find((project) => project.id === row.projectId);
    const productionQuantity = normalizeOptionalPositiveInteger(row.productionQuantity || row.totalQuantity || linkedProject?.totalQuantity);
    return {
      ...rowWithoutRevision,
      projectId: row.projectId || "",
      bomQtyA: Math.max(0, Number(row.bomQtyA || 0)),
      bomQtyB: Math.max(0, Number(row.bomQtyB || 0)),
      productionQuantity,
      dueDate: row.dueDate || linkedProject?.dueDate || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
      orderNumber: row.orderNumber || linkedProject?.orderNumber || "",
      customer: row.customer || linkedProject?.customer || "",
      productionStatus: PROJECT_STATUSES.includes(row.productionStatus || linkedProject?.status)
        ? row.productionStatus || linkedProject?.status
        : "planned",
      structureManaged: Boolean(row.structureManaged || (Array.isArray(row.structureItems) && row.structureItems.length)),
      structureItems: Array.isArray(row.structureItems)
        ? row.structureItems.map((item, index) => normalizeSpecificationStructureItem(item, index))
        : [],
    };
  }

  if (sectionId === "employees") {
    let migratedDepartment = EMPLOYEE_DEPARTMENT_MIGRATION[row.department] || row.department || "SMT отдел";
    if (row.department === "Производство") {
      migratedDepartment = String(row.role || "").toLowerCase().includes("smt") ? "SMT отдел" : "THT отдел";
    }
    return {
      ...row,
      department: migratedDepartment,
      roleId: row.roleId || "role-viewer",
      password: row.password ?? "",
    };
  }

  if (sectionId === "roles") {
    return {
      ...row,
      accessLevel: Math.max(0, Math.min(100, Number(row.accessLevel || 0))),
      modules: normalizeRoleModuleList(row),
      directories: normalizeRoleDirectoryList(row.directories || "statuses"),
      permissions: row.permissions || "read",
      status: row.status || "Активен",
    };
  }

  return row;
}

function normalizeRoleModuleList(row) {
  const rawModules = String(row.modules || "gantt").trim();
  if (rawModules === "*") return "*";
  const modules = parseAccessList(rawModules);
  if (modules.has("dashboard")) {
    modules.delete("dashboard");
  }
  modules.delete("reports");
  modules.delete("debug");
  if (modules.has("planning")) {
    modules.add("gantt");
  }
  if (roleAllowsValue(row.directories, "specifications")) {
    modules.add("speki");
  }
  if (modules.has("specifications")) {
    modules.delete("specifications");
    modules.add("speki");
  }
  if (modules.has("calculator") || modules.has("speki") || modules.has("routes")) {
    modules.add("operationMap");
    modules.add("routes");
  }
  if (roleAllowsValue(row.directories, "bomLists") || modules.has("speki")) {
    modules.add("bomLists");
  }
  if (modules.has("bomLists") || modules.has("calculator")) {
    modules.add("nomenclature");
  }
  modules.delete("tree");
  const order = ["gantt", "planning", "operationMap", "routes", "speki", "bomLists", "nomenclature", "directories", "calculator"];
  return order.filter((moduleId) => modules.has(moduleId)).join(", ") || "gantt";
}

function normalizeRoleDirectoryList(value) {
  const rawDirectories = String(value || "statuses").trim();
  if (rawDirectories === "*") return "*";
  const directories = parseAccessList(rawDirectories);
  if (directories.has("departments")) {
    directories.delete("departments");
    directories.add("workCenters");
  }
  if (directories.has("resources") || directories.has("equipment")) {
    directories.delete("resources");
    directories.delete("equipment");
    directories.add("productionResources");
  }
  ["projects", "specifications", "bomLists", "routes"].forEach((sectionId) => directories.delete(sectionId));
  const order = ["workCenters", "productionResources", "norms", "employees", "roles", "statuses", "componentTypes", "nomenclatureTypes"];
  return order.filter((sectionId) => directories.has(sectionId)).join(", ") || "statuses";
}

function shouldKeepDirectoryRow(sectionId, row) {
  if (!row || typeof row !== "object") return false;
  if ((sectionId === "bomLists" || sectionId === "specifications") && row.id) return true;
  return !isBlankDirectoryRow(row);
}

function isBlankDirectoryRow(row) {
  if (!row || typeof row !== "object") return true;
  const meaningfulValues = Object.entries(row)
    .filter(([key]) => key !== "id" && key !== "status")
    .map(([, value]) => String(value ?? "").trim());
  return meaningfulValues.every((value) => !value);
}

function normalizePlanningState(state) {
  state.projects = [];
  state.batches = Array.isArray(state.batches) ? state.batches : [];
  state.routes = Array.isArray(state.routes) ? state.routes : [];
  state.routeSteps = Array.isArray(state.routeSteps) ? state.routeSteps : [];
  state.slots = Array.isArray(state.slots) ? state.slots : [];
  state.workCenters = Array.isArray(state.workCenters) ? state.workCenters : [];
  const warehouseCenter = {
    id: "warehouse",
    name: "Склад",
    code: "WH",
    description: "Финальное размещение готовой партии на складе",
    unitType: "warehouse",
    isPlanningUnit: true,
    showInGantt: true,
    isActive: true,
  };

  if (!state.workCenters.some((center) => center.id === warehouseCenter.id)) {
    state.workCenters = [...state.workCenters, warehouseCenter];
  }

  state.workCenters = state.workCenters.map((center) => normalizeWorkCenterUnit(center));
  state.routeSteps = state.routeSteps.map((step) => normalizeRouteStepCalculationFields(step, state));

  for (const route of state.routes) {
    const steps = state.routeSteps.filter((step) => step.routeId === route.id);
    if (!steps.some((step) => step.workCenterId === "warehouse")) {
      const nextOrder = Math.max(0, ...steps.map((step) => Number(step.stepOrder || 0))) + 1;
      state.routeSteps.push({
        id: `rs-${route.projectId}-warehouse`,
        routeId: route.id,
        workCenterId: "warehouse",
        operationName: "Склад",
        stepOrder: nextOrder,
        isRequired: true,
        calculationType: "rate",
        unitsPerHour: getWorkCenterUnitsPerHour("warehouse", state),
        boardsPerPanel: 1,
        setupMin: 0,
      });
    }
  }

  state.slots = state.slots.map((slot) => recalculateSlotEndByQuantity(slot, state));
  addMissingWarehouseSlots(state);
  state.slots = state.slots.map((slot) => recalculateSlotEndByQuantity(slot, state));
  return state;
}

function addMissingWarehouseSlots(state) {
  const stamp = new Date().toISOString();
  const groups = Object.values(state.slots.reduce((map, slot) => {
    const key = `${slot.routeId || slot.projectId}:${slot.batchId}`;
    if (!map[key]) map[key] = [];
    map[key].push(slot);
    return map;
  }, {}));

  for (const slots of groups) {
    if (!slots.length || slots.some((slot) => slot.workCenterId === "warehouse")) continue;

    const latest = [...slots].sort((left, right) => toDate(right.plannedEnd) - toDate(left.plannedEnd))[0];
    const route = state.routes.find((item) => item.id === latest.routeId)
      || state.routes.find((item) => (item.specificationId === latest.specificationId || item.projectId === latest.projectId) && item.isDefault)
      || state.routes.find((item) => item.specificationId === latest.specificationId || item.projectId === latest.projectId);
    const warehouseStep = state.routeSteps.find((step) => step.routeId === route?.id && step.workCenterId === "warehouse");
    if (!warehouseStep) continue;

    const plannedStart = addMs(latest.plannedEnd, 60 * 60 * 1000);
    const quantity = normalizeQuantity(latest.quantity);
    const plannedEnd = calculatePlannedEndByQuantity(plannedStart, "warehouse", quantity, state, warehouseStep.unitsPerHour || null, warehouseStep.boardsPerPanel || null, warehouseStep);
    state.slots.push({
      id: `s-${latest.projectId}-${latest.batchId}-warehouse`,
      routeId: route.id,
      specificationId: latest.specificationId || route.specificationId || latest.projectId,
      projectId: latest.specificationId || route.specificationId || latest.projectId,
      batchId: latest.batchId,
      workCenterId: "warehouse",
      routeStepId: warehouseStep.id,
      operationName: "Склад",
      quantity,
      plannedStart: toSlotDateTime(plannedStart),
      plannedEnd: toSlotDateTime(plannedEnd),
      status: "planned",
      comment: "Финальная приемка партии на склад.",
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
}

function getWorkCenterUnitsPerHour(workCenterId, state = null) {
  let sourceState = state;
  if (!sourceState) {
    try {
      sourceState = planningState;
    } catch {
      sourceState = null;
    }
  }
  const center = sourceState?.workCenters?.find((item) => item.id === workCenterId);
  if (center?.isPlanningUnit === false) return 0;
  const centerRate = Number(center?.unitsPerHour || 0);
  if (Number.isFinite(centerRate) && centerRate > 0) return centerRate;
  return Number(WORK_CENTER_RATES[workCenterId] || 40);
}

function normalizeQuantity(value, fallback = 1) {
  const quantity = Math.round(Number(value));
  if (Number.isFinite(quantity) && quantity > 0) return quantity;
  return Math.max(1, Math.round(Number(fallback) || 1));
}

function normalizeBoardsPerPanel(value, fallback = 1) {
  const boardsPerPanel = Math.round(Number(value));
  if (Number.isFinite(boardsPerPanel) && boardsPerPanel > 0) return boardsPerPanel;
  return Math.max(1, Math.round(Number(fallback) || 1));
}

function workCenterUsesPanelBatching(workCenterId) {
  return ["smt", "aoi", "wash", "coating"].includes(String(workCenterId || ""));
}

function getSpecificationItemBoardsPerPanel(item) {
  return item?.type === "bom" ? normalizeBoardsPerPanel(item.boardsPerPanel, 1) : 1;
}

function getRouteStepBoardsPerPanel(step) {
  return normalizeBoardsPerPanel(step?.boardsPerPanel, 1);
}

function toSlotDateTime(value) {
  return `${isoLocal(value)}:00`;
}

function getRuntimePlanningState(fallback = null) {
  try {
    return planningState || fallback;
  } catch {
    return fallback;
  }
}

function getRuntimeDirectoryState(fallback = null) {
  try {
    return directoryState || fallback;
  } catch {
    return fallback;
  }
}

function getDurationWorkCenter(workCenterId, state = null) {
  const sourceState = state || getRuntimePlanningState();
  return sourceState?.workCenters?.find((center) => center.id === workCenterId) || null;
}

function getDurationResourcesForWorkCenter(workCenterId, state = null) {
  const center = getDurationWorkCenter(workCenterId, state);
  const matched = getProductionResourcesForWorkCenter(workCenterId)
    .filter((resource) => resourceParticipatesInCalculation(resource) || resourceParticipatesInPlanning(resource));
  if (matched.length) return matched;
  if (isSmtOperationWorkCenter(workCenterId, { workCenter: center }, state)) return getDefaultSmtLineConfigurations();
  if (!center) return [];
  return [makeFallbackProductionResource(center.id)];
}

function isSmtOperationWorkCenter(workCenterId, operationContext = null, state = null) {
  const id = String(workCenterId || operationContext?.workCenterId || "");
  if (id === "smt" || isSmtLineWorkCenterId(id)) return true;
  const center = operationContext?.workCenter || getDurationWorkCenter(id, state);
  const text = normalizeLookupText([center?.id, center?.name, center?.code, operationContext?.operationName].filter(Boolean).join(" "));
  if (text.includes("smt") || text.includes("смт")) return true;
  const resourceId = String(operationContext?.resourceId || "");
  if (resourceId && getSmtLineConfigurations().some((line) => line.id === resourceId)) return true;
  return false;
}

function getDefaultOperationCalculationType(workCenterId, operationContext = null) {
  const explicit = String(operationContext?.calculationType || "").trim();
  if (["components", "manual", "normative", "rate"].includes(explicit)) return explicit;
  if (isSmtOperationWorkCenter(workCenterId, operationContext)) return "components";
  if (String(workCenterId || "") === "warehouse") return "rate";
  return "manual";
}

function normalizeRouteStepCalculationFields(step = {}, state = null) {
  const workCenterId = step.workCenterId || "manual";
  const calculationType = getDefaultOperationCalculationType(workCenterId, step);
  const boardsPerPanel = normalizeBoardsPerPanel(step.boardsPerPanel, 1);
  const resources = getDurationResourcesForWorkCenter(workCenterId, state);
  const resource = resources.find((item) => item.id === step.resourceId) || resources[0] || null;
  const secondsPerPanel = Number(step.secondsPerPanel || 0) > 0
    ? Math.max(1, Number(step.secondsPerPanel))
    : calculationType === "components" || calculationType === "rate"
      ? 0
      : getDefaultSecondsPerPanel(workCenterId, boardsPerPanel);

  return {
    ...step,
    workCenterId,
    calculationType,
    boardsPerPanel,
    resourceId: step.resourceId || resource?.id || "",
    secondsPerPanel,
    unitsPerHour: Number(step.unitsPerHour || getWorkCenterUnitsPerHour(workCenterId, state) || 0),
    setupMin: Math.max(0, Number(step.setupMin ?? resource?.changeoverMin ?? 0)),
  };
}

function getDurationOperationContext(operationContext, workCenterId, state = null, unitsPerHourOverride = null, boardsPerPanelOverride = null) {
  const sourceState = state || getRuntimePlanningState();
  const routeStep = operationContext?.routeStepId
    ? sourceState?.routeSteps?.find((step) => step.id === operationContext.routeStepId)
    : null;
  const context = {
    ...(routeStep || {}),
    ...(operationContext || {}),
  };
  const resolvedWorkCenterId = workCenterId || context.workCenterId || routeStep?.workCenterId || "";
  const boardsPerPanel = normalizeBoardsPerPanel(boardsPerPanelOverride || context.boardsPerPanel, 1);
  return {
    ...context,
    workCenterId: resolvedWorkCenterId,
    unitsPerHour: unitsPerHourOverride || context.unitsPerHour || "",
    boardsPerPanel,
    calculationType: getDefaultOperationCalculationType(resolvedWorkCenterId, context),
  };
}

function getOperationSetupMs(operationContext = null, resource = null) {
  const setupMin = Number(operationContext?.setupMin ?? resource?.changeoverMin ?? 0);
  return Math.max(0, Number.isFinite(setupMin) ? setupMin * 60 * 1000 : 0);
}

function getDurationBomList(operationContext = null) {
  const bomId = operationContext?.bomListId || "";
  const directory = getRuntimeDirectoryState();
  if (!bomId || !directory?.bomLists) return null;
  return directory.bomLists.find((bom) => bom.id === bomId) || null;
}

function getDurationComponentTypes() {
  const directory = getRuntimeDirectoryState();
  const source = directory?.componentTypes?.length ? directory.componentTypes : DEFAULT_COMPONENT_TYPES;
  return source.filter((type) => type.status !== "Отключен");
}

function getDurationComponentCounts(bom) {
  if (!bom) return Object.fromEntries(getDurationComponentTypes().map((type) => [type.id, 0]));
  const importRows = Array.isArray(bom.importRows) ? bom.importRows.map((row) => normalizeBomImportRow(row)) : [];
  if (importRows.length) {
    const totals = summarizeBomComponentFields(importRows);
    return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
      field.componentId,
      Math.max(0, Math.round(Number(totals[field.key] || 0))),
    ]));
  }
  return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
    field.componentId,
    Math.max(0, Math.round(Number(bom[field.key] || 0))),
  ]));
}

function getOperationSmtResource(operationContext = null, state = null) {
  const lineId = getSmtLineIdFromWorkCenterId(operationContext?.workCenterId) || operationContext?.resourceId || "";
  const resources = getDurationResourcesForWorkCenter("smt", state);
  return resources.find((resource) => resource.id === lineId)
    || getDurationResourcesForWorkCenter(operationContext?.workCenterId || "smt", state).find((resource) => resource.id === lineId)
    || resources[0]
    || getDefaultSmtLineConfigurations()[0];
}

function buildSmtComponentDurationRows(bom, resource, boardsPerPanel, boardQuantity = 1) {
  const resourceBaseCph = getResourceBaseCph(resource);
  const efficiency = Math.max(0.1, Number(resource?.efficiency || 100) / 100);
  const counts = getDurationComponentCounts(bom);
  return getDurationComponentTypes().map((type) => {
    const count = Math.max(0, Math.round(Number(counts[type.id] ?? 0)));
    const coefficient = Math.max(0.1, Number(type.coefficient || 1));
    const typeLimitCph = Math.max(1, Number(type.placementsPerHour || resourceBaseCph / coefficient));
    const effectiveCph = Math.max(1, Math.min(typeLimitCph, resourceBaseCph / coefficient) * efficiency);
    const secondsPerBoard = count > 0 ? count / effectiveCph * 3600 : 0;
    return {
      type,
      count,
      coefficient,
      effectiveCph,
      secondsPerBoard,
      secondsPerPanel: secondsPerBoard * boardsPerPanel,
      totalPlacements: count * boardQuantity,
      complexity: count * coefficient,
    };
  });
}

function calculateSmtOperationDurationMs(operationContext, quantity, state = null) {
  const boardsPerPanel = normalizeBoardsPerPanel(operationContext?.boardsPerPanel, 1);
  const boardQuantity = normalizeQuantity(quantity);
  const panelCount = Math.max(1, Math.ceil(boardQuantity / boardsPerPanel));
  const resource = getOperationSmtResource(operationContext, state);
  const bom = getDurationBomList(operationContext);
  const componentRows = buildSmtComponentDurationRows(bom, resource, boardsPerPanel, boardQuantity);
  const perBoardSeconds = componentRows.reduce((sum, row) => sum + row.secondsPerBoard, 0);
  if (perBoardSeconds <= 0) return null;
  const perPanelSeconds = perBoardSeconds * boardsPerPanel;
  return getOperationSetupMs(operationContext, resource) + perPanelSeconds * panelCount * 1000;
}

function getWorkCenterEmployeeCount(workCenterId, state = null) {
  const center = getDurationWorkCenter(workCenterId, state);
  const names = new Set([
    center?.name,
    center?.code,
    ...(center?.legacyDepartmentNames || []),
  ].filter(Boolean).map(normalizeLookupText));
  const employees = (getRuntimeDirectoryState()?.employees || []).filter((employee) => {
    if (["Уволен", "Отключен"].includes(employee.status)) return false;
    return names.has(normalizeLookupText(employee.department));
  });
  if (employees.length) return employees.length;

  const resources = getDurationResourcesForWorkCenter(workCenterId, state);
  for (const resource of resources) {
    const match = String(resource.capacity || "").match(/([\d.,]+)/);
    if (!match) continue;
    const parsed = Number(match[1].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
  }

  return Math.max(1, Number(center?.capacity || 1));
}

function calculateManualLaborDurationMs(operationContext, quantity, state = null) {
  const workCenterId = operationContext?.workCenterId || "";
  const resources = getDurationResourcesForWorkCenter(workCenterId, state);
  const resource = resources.find((item) => item.id === operationContext?.resourceId) || resources[0] || null;
  const setupMs = getOperationSetupMs(operationContext, resource);
  const secondsPerUnit = Math.max(1, Number(operationContext?.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, 1)));
  const employeesCount = getWorkCenterEmployeeCount(workCenterId, state);
  return setupMs + (normalizeQuantity(quantity) * secondsPerUnit * 1000) / Math.max(1, employeesCount);
}

function calculateNormativeSerialDurationMs(operationContext, quantity, state = null) {
  const workCenterId = operationContext?.workCenterId || "";
  const resources = getDurationResourcesForWorkCenter(workCenterId, state);
  const resource = resources.find((item) => item.id === operationContext?.resourceId) || resources[0] || null;
  const setupMs = getOperationSetupMs(operationContext, resource);
  const boardsPerPanel = normalizeBoardsPerPanel(operationContext?.boardsPerPanel, 1);
  const batchQuantity = workCenterUsesPanelBatching(workCenterId)
    ? Math.max(1, Math.ceil(normalizeQuantity(quantity) / boardsPerPanel))
    : normalizeQuantity(quantity);
  const secondsPerBatch = Math.max(1, Number(operationContext?.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, boardsPerPanel)));
  return setupMs + batchQuantity * secondsPerBatch * 1000;
}

function calculateRateDurationMs(workCenterId, quantity, state = null, unitsPerHourOverride = null, boardsPerPanelOverride = null) {
  const rate = Math.max(1, Number(unitsPerHourOverride || getWorkCenterUnitsPerHour(workCenterId, state)));
  const normalizedQuantity = normalizeQuantity(quantity);
  const boardsPerPanel = normalizeBoardsPerPanel(boardsPerPanelOverride, 1);
  if (boardsPerPanel > 1 && workCenterUsesPanelBatching(workCenterId)) {
    const panelCount = Math.max(1, Math.ceil(normalizedQuantity / boardsPerPanel));
    const panelRate = Math.max(1 / 60, rate / boardsPerPanel);
    return Math.max(MIN_OPERATION_DURATION_MS, panelCount / panelRate * 60 * 60 * 1000);
  }
  return Math.max(MIN_OPERATION_DURATION_MS, normalizedQuantity / rate * 60 * 60 * 1000);
}

function calculateRequiredDurationMs(workCenterId, quantity, state = null, unitsPerHourOverride = null, boardsPerPanelOverride = null, operationContext = null) {
  const context = getDurationOperationContext(operationContext, workCenterId, state, unitsPerHourOverride, boardsPerPanelOverride);
  let durationMs = null;

  if (context.calculationType === "components" || isSmtOperationWorkCenter(workCenterId, context, state)) {
    durationMs = calculateSmtOperationDurationMs(context, quantity, state);
  } else if (context.calculationType === "manual") {
    durationMs = calculateManualLaborDurationMs(context, quantity, state);
  } else if (context.calculationType === "normative") {
    durationMs = calculateNormativeSerialDurationMs(context, quantity, state);
  }

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    durationMs = calculateRateDurationMs(workCenterId, quantity, state, unitsPerHourOverride, boardsPerPanelOverride);
  }

  return Math.max(MIN_OPERATION_DURATION_MS, durationMs);
}

function calculatePlannedEndByQuantity(plannedStart, workCenterId, quantity, state = null, unitsPerHourOverride = null, boardsPerPanelOverride = null, operationContext = null) {
  const durationMs = calculateRequiredDurationMs(workCenterId, quantity, state, unitsPerHourOverride, boardsPerPanelOverride, operationContext);
  const workingStart = snapToWorkingTime(workCenterId, plannedStart, state);
  return addWorkingDuration(workCenterId, workingStart, durationMs, state);
}

function calculateQuantityByDuration(workCenterId, plannedStart, plannedEnd, operationContext = null) {
  const workingDurationMs = getWorkingDurationBetween(workCenterId, plannedStart, plannedEnd, planningState);
  const durationHours = workingDurationMs / (60 * 60 * 1000);
  const context = getDurationOperationContext(operationContext, workCenterId, planningState, operationContext?.unitsPerHour || null, operationContext?.boardsPerPanel || null);
  const durationMs = workingDurationMs;

  if (context.calculationType === "components" || isSmtOperationWorkCenter(workCenterId, context, planningState)) {
    const resource = getOperationSmtResource(context, planningState);
    const bom = getDurationBomList(context);
    const boardsPerPanel = normalizeBoardsPerPanel(context.boardsPerPanel, 1);
    const perBoardSeconds = buildSmtComponentDurationRows(bom, resource, boardsPerPanel).reduce((sum, row) => sum + row.secondsPerBoard, 0);
    if (perBoardSeconds > 0) {
      const setupMs = getOperationSetupMs(context, resource);
      const productiveMs = Math.max(0, durationMs - setupMs);
      return normalizeQuantity(Math.max(1, Math.floor(productiveMs / (perBoardSeconds * boardsPerPanel * 1000)) * boardsPerPanel));
    }
  }

  if (context.calculationType === "manual") {
    const secondsPerUnit = Math.max(1, Number(context.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, 1)));
    const employeesCount = getWorkCenterEmployeeCount(workCenterId, planningState);
    const setupMs = getOperationSetupMs(context);
    return normalizeQuantity((Math.max(0, durationMs - setupMs) / 1000 / secondsPerUnit) * employeesCount);
  }

  return normalizeQuantity(durationHours * getWorkCenterUnitsPerHour(workCenterId));
}

function recalculateSlotEndByQuantity(slot, state = null) {
  const quantity = normalizeQuantity(slot.quantity);
  const plannedStart = toSlotDateTime(snapToWorkingTime(slot.workCenterId, slot.plannedStart, state));
  return {
    ...slot,
    quantity,
    boardsPerPanel: normalizeBoardsPerPanel(slot.boardsPerPanel, 1),
    plannedStart,
    plannedEnd: toSlotDateTime(calculatePlannedEndByQuantity(plannedStart, slot.workCenterId, quantity, state, slot.unitsPerHour, slot.boardsPerPanel, slot)),
  };
}

function getRouteBufferMs() {
  return DEFAULT_ROUTE_BUFFER_MS;
}

function getWorkCenterCapacity(workCenterId) {
  if (isSmtLineWorkCenterId(workCenterId)) return 1;
  const center = planningState.workCenters.find((item) => item.id === workCenterId);
  if (center?.isPlanningUnit === false) return 0;
  return Math.max(1, Number(center?.capacity || 1));
}

function getSlotStepOrder(slot) {
  return planningState.routeSteps.find((step) => step.id === slot.routeStepId)?.stepOrder ?? 9999;
}

function getSlotRouteTaskId(slot) {
  const step = planningState.routeSteps.find((item) => item.id === slot?.routeStepId);
  return getRouteStepTaskId(step);
}

function getOrderedBatchSlots(projectId, batchId, taskId = null) {
  return planningState.slots
    .filter((slot) => (
      slot.projectId === projectId
      && slot.batchId === batchId
      && (!taskId || getSlotRouteTaskId(slot) === taskId)
    ))
    .sort((left, right) => (
      getSlotRouteTaskId(left).localeCompare(getSlotRouteTaskId(right), "ru")
      || getSlotStepOrder(left) - getSlotStepOrder(right)
      || toDate(left.plannedStart) - toDate(right.plannedStart)
    ));
}

function getRouteNeighbor(slot, direction) {
  const orderedSlots = getOrderedBatchSlots(slot.projectId, slot.batchId, getSlotRouteTaskId(slot));
  const index = orderedSlots.findIndex((item) => item.id === slot.id);
  if (index === -1) return null;
  return orderedSlots[index + direction] || null;
}

function getEarliestRouteStart(projectId, batchId, routeStepId) {
  const step = planningState.routeSteps.find((item) => item.id === routeStepId);
  const taskId = getRouteStepTaskId(step);
  const previousSlots = getOrderedBatchSlots(projectId, batchId, taskId)
    .filter((slot) => getSlotStepOrder(slot) < Number(step?.stepOrder || 0));
  const previous = previousSlots[previousSlots.length - 1];
  if (previous) return addMs(previous.plannedEnd, getRouteBufferMs());
  return fromDateInput(ui.windowStart);
}

function getPlannedStepIds(projectId, batchId) {
  return new Set(planningState.slots
    .filter((slot) => (slot.routeId === projectId || slot.specificationId === projectId || slot.projectId === projectId) && slot.batchId === batchId)
    .map((slot) => slot.routeStepId));
}

function buildBacklogItems(limit = 14) {
  const items = [];
  const routes = getVisibleGanttRoutes();

  for (const route of routes) {
    const project = getProject(route.specificationId || route.projectId);
    if (!project) continue;
    const routeSteps = getSchedulableRouteSteps(route.id);
    const batches = planningState.batches.filter((batch) => batch.routeId === route.id || batch.specificationId === project.id || batch.projectId === project.id);

    for (const batch of batches) {
      const plannedStepIds = getPlannedStepIds(route.id, batch.id);
      const nextStep = routeSteps.find((step) => (
        !plannedStepIds.has(step.id)
        && (step.workCenterId !== "warehouse" || plannedStepIds.size > 0)
      ));
      if (!nextStep) continue;

      const quantity = getRouteStepQuantityForBatch(nextStep, batch);
      const earliestStart = getEarliestRouteStart(project.id, batch.id, nextStep.id);
      const durationMs = calculateRequiredDurationMs(nextStep.workCenterId, quantity, planningState, nextStep.unitsPerHour || null, nextStep.boardsPerPanel || null, nextStep);
      const window = findFreeWindow(nextStep.workCenterId, durationMs, earliestStart, null, nextStep.resourceId || "");
      const dueState = getProjectDeadlineState(project);

      items.push({
        project,
        batch,
        routeStep: nextStep,
        workCenter: getWorkCenter(nextStep.workCenterId),
        quantity,
        earliestStart,
        plannedStart: window.start,
        plannedEnd: window.end,
        dueState,
      });
    }
  }

  return items
    .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))
    .slice(0, limit);
}

function windowsOverlap(startA, endA, startB, endB) {
  return toDate(startA) < toDate(endB) && toDate(endA) > toDate(startB);
}

function isWindowAvailable(workCenterId, start, end, excludeSlotId = null, resourceId = "") {
  const capacity = resourceId ? 1 : getWorkCenterCapacity(workCenterId);
  const relevantSlots = planningState.slots.filter((slot) => (
    slot.workCenterId === workCenterId
    && (!resourceId || getSlotGanttResourceId(slot) === resourceId)
    && slot.id !== excludeSlotId
    && windowsOverlap(start, end, slot.plannedStart, slot.plannedEnd)
  ));
  if (relevantSlots.length < capacity) return true;

  const points = [toDate(start).getTime(), toDate(end).getTime()];
  for (const slot of relevantSlots) {
    points.push(toDate(slot.plannedStart).getTime(), toDate(slot.plannedEnd).getTime());
  }

  const sortedPoints = [...new Set(points)]
    .filter((point) => point >= toDate(start).getTime() && point <= toDate(end).getTime())
    .sort((left, right) => left - right);

  for (let index = 0; index < sortedPoints.length - 1; index += 1) {
    const probe = new Date((sortedPoints[index] + sortedPoints[index + 1]) / 2);
    const concurrent = relevantSlots.filter((slot) => (
      toDate(slot.plannedStart) <= probe && toDate(slot.plannedEnd) > probe
    )).length + 1;
    if (concurrent > capacity) return false;
  }

  return true;
}

function findFreeWindow(workCenterId, durationMs, earliestStart, excludeSlotId = null, resourceId = "") {
  const snapMs = getGanttSnapMs();
  let candidateStart = snapToWorkingTime(workCenterId, snapDate(earliestStart, snapMs), planningState);
  const maxIterations = 160;

  for (let index = 0; index < maxIterations; index += 1) {
    candidateStart = snapToWorkingTime(workCenterId, candidateStart, planningState);
    const candidateEnd = addWorkingDuration(workCenterId, candidateStart, durationMs, planningState);
    if (isWindowAvailable(workCenterId, candidateStart, candidateEnd, excludeSlotId, resourceId)) {
      return { start: candidateStart, end: candidateEnd };
    }

    const overlappingSlots = planningState.slots
      .filter((slot) => (
        slot.workCenterId === workCenterId
        && (!resourceId || getSlotGanttResourceId(slot) === resourceId)
        && slot.id !== excludeSlotId
        && windowsOverlap(candidateStart, candidateEnd, slot.plannedStart, slot.plannedEnd)
      ))
      .sort((left, right) => toDate(left.plannedEnd) - toDate(right.plannedEnd));

    candidateStart = snapToWorkingTime(workCenterId, snapDate(addMs(overlappingSlots[0]?.plannedEnd || candidateEnd, getRouteBufferMs()), snapMs), planningState);
  }

  return { start: candidateStart, end: addWorkingDuration(workCenterId, candidateStart, durationMs, planningState) };
}

function getGanttSnapMs() {
  return GANTT_SNAP_MS;
}

function normalizeGanttZoom(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return defaultUiState.ganttZoom;
  return GANTT_ZOOM_LEVELS.reduce((closest, level) => (
    Math.abs(level - number) < Math.abs(closest - number) ? level : closest
  ), GANTT_ZOOM_LEVELS[1]);
}

function getGanttZoomIndex(value = ui.ganttZoom) {
  const normalized = normalizeGanttZoom(value);
  return Math.max(0, GANTT_ZOOM_LEVELS.indexOf(normalized));
}

function getGanttZoomPercent(value = ui.ganttZoom) {
  return `${Math.round(normalizeGanttZoom(value) * 100)}%`;
}

function setGanttZoom(action) {
  const index = getGanttZoomIndex();
  const nextIndex = action === "in"
    ? Math.min(GANTT_ZOOM_LEVELS.length - 1, index + 1)
    : action === "out"
      ? Math.max(0, index - 1)
      : GANTT_ZOOM_LEVELS.indexOf(1);
  ui.ganttZoom = GANTT_ZOOM_LEVELS[Math.max(0, nextIndex)];
  persistUiState();
  render();
}

function normalizeGanttSlotContent(value) {
  return GANTT_SLOT_CONTENT_MODES.some((mode) => mode.id === value) ? value : defaultUiState.ganttSlotContent;
}

function getGanttSlotContentMode() {
  return GANTT_SLOT_CONTENT_MODES.find((mode) => mode.id === normalizeGanttSlotContent(ui.ganttSlotContent))
    || GANTT_SLOT_CONTENT_MODES[0];
}

function buildGanttScaleInfo(scale, startValue, countOverride = null) {
  const base = buildTimeScale(scale, startValue, countOverride);
  const zoom = normalizeGanttZoom(ui.ganttZoom);
  const cellWidth = Math.round(base.cellWidth * zoom);
  return {
    ...base,
    cellWidth,
    width: base.count * cellWidth,
    zoom,
  };
}

function getGanttSnapScaleInfo(scaleInfo) {
  return {
    ...scaleInfo,
    snapMs: getGanttSnapMs(),
  };
}

function getGanttSnapWidth(scaleInfo) {
  return scaleInfo.cellWidth * (getGanttSnapMs() / scaleInfo.unitMs);
}

function getTimelineCount(scale, startValue = null) {
  const base = scaleConfig[scale]?.count || 1;
  const configuredCount = Math.max(base, Math.round(Number(ui.timelineCounts?.[scale] || base)));
  const unitMs = scaleConfig[scale]?.unitMs || 1;
  const start = startValue ? toDate(startValue) : toDate(fromDateInput(ui.windowStart));
  const maxSlotEnd = planningState.slots.reduce((max, slot) => Math.max(max, toDate(slot.plannedEnd).getTime()), start.getTime());
  const requiredCount = Math.ceil((maxSlotEnd - start.getTime()) / unitMs) + Math.max(2, Math.round((TIMELINE_LOAD_CHUNK[scale] || base) / 3));
  return Math.min(TIMELINE_MAX_COUNT[scale] || configuredCount, Math.max(base, configuredCount, requiredCount));
}

function getVisiblePlanningProjects() {
  return getProductionContexts().filter((project) => projectMatchesFilters(project));
}

function getVisibleGanttRoutes() {
  return (planningState.routes || [])
    .filter((route) => routeMatchesGanttFilters(route))
    .sort((left, right) => {
      const leftSpecification = getRouteSpecification(left);
      const rightSpecification = getRouteSpecification(right);
      const leftProject = getProject(left.projectId);
      const rightProject = getProject(right.projectId);
      return String(leftSpecification?.name || getProjectDisplayName(leftProject) || "").localeCompare(String(rightSpecification?.name || getProjectDisplayName(rightProject) || ""), "ru")
        || String(left.name || "").localeCompare(String(right.name || ""), "ru");
    });
}

function isGanttRouteExpanded(route) {
  return Boolean(route?.id && (ui.expandedProjects.has(route.id) || ui.expandedProjects.has(route.projectId)));
}

function areAllVisibleProjectsExpanded() {
  const routes = getVisibleGanttRoutes();
  return routes.length > 0 && routes.every((route) => isGanttRouteExpanded(route));
}

function extendTimelineIfNeeded(shell, scaleInfo) {
  if (!shell || !scaleInfo) return false;
  const remaining = shell.scrollWidth - shell.clientWidth - shell.scrollLeft;
  const threshold = Math.max(shell.clientWidth * 0.42, scaleInfo.cellWidth * 3);
  if (remaining > threshold) return false;

  const current = getTimelineCount(ui.scale, scaleInfo.start);
  const next = Math.min(TIMELINE_MAX_COUNT[ui.scale] || current, current + (TIMELINE_LOAD_CHUNK[ui.scale] || 0));
  if (next <= current) return false;

  ui.timelineCounts = {
    ...defaultUiState.timelineCounts,
    ...(ui.timelineCounts || {}),
    [ui.scale]: next,
  };
  ui.scrollLeft = shell.scrollLeft;
  ui.scrollTop = shell.scrollTop;
  persistUiState();
  render();
  return true;
}

function cascadeBatchFromSlot(slotId) {
  const changedSlot = planningState.slots.find((slot) => slot.id === slotId);
  if (!changedSlot) return;

  const orderedSlots = getOrderedBatchSlots(changedSlot.projectId, changedSlot.batchId, getSlotRouteTaskId(changedSlot));
  const startIndex = orderedSlots.findIndex((slot) => slot.id === slotId);
  if (startIndex === -1) return;

  let previous = orderedSlots[startIndex];
  for (let index = startIndex + 1; index < orderedSlots.length; index += 1) {
    const current = planningState.slots.find((slot) => slot.id === orderedSlots[index].id);
    if (!current || current.locked || current.status === "completed") {
      previous = current || previous;
      continue;
    }

    const earliestStart = addMs(previous.plannedEnd, getRouteBufferMs());
    if (toDate(current.plannedStart) < earliestStart) {
      const durationMs = calculateRequiredDurationMs(current.workCenterId, current.quantity, planningState, current.unitsPerHour || null, current.boardsPerPanel || null, current);
      const window = findFreeWindow(current.workCenterId, durationMs, earliestStart, current.id, current.resourceId || "");
      current.plannedStart = toSlotDateTime(window.start);
      current.plannedEnd = toSlotDateTime(window.end);
      current.updatedAt = new Date().toISOString();
    }
    previous = current;
  }
}

function cascadeIfEnabled(slotId) {
  if (ui.autoCascade) cascadeBatchFromSlot(slotId);
}

function getProjectDeadlineState(project) {
  const slots = planningState.slots.filter((slot) => slot.projectId === project.id);
  if (!slots.length) return { tone: "neutral", label: "нет плана", slackMs: null };

  const latestEnd = slots.reduce((latest, slot) => Math.max(latest, toDate(slot.plannedEnd).getTime()), 0);
  const dueEnd = addMs(`${project.dueDate}T00:00:00`, 24 * 60 * 60 * 1000 - 1).getTime();
  const slackMs = dueEnd - latestEnd;
  const days = Math.ceil(Math.abs(slackMs) / (24 * 60 * 60 * 1000));

  if (slackMs < 0) return { tone: "critical", label: `срыв ${days} д`, slackMs };
  if (slackMs < 2 * 24 * 60 * 60 * 1000) return { tone: "warning", label: `запас ${days} д`, slackMs };
  return { tone: "ok", label: `запас ${days} д`, slackMs };
}

function render() {
  rememberScroll();
  persistUiState();
  scheduleGlobalSaveUxRefresh();

  if (!getAuthEmployee()) {
    app.innerHTML = renderAuthPage();
    bindAuthEvents();
    return;
  }

  ensureAuthorizedModule();

  if (ui.activeModule === "directories") {
    app.innerHTML = `
      <main class="app-shell directory-app-shell" data-layout="app-shell" data-layout-page="directories">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderDirectoryPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindDirectoryEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "calculator") {
    calculatorState = normalizeCalculatorState(calculatorState);
    app.innerHTML = `
      <main class="app-shell calculator-app-shell" data-layout="app-shell" data-layout-page="calculator">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderCalculatorPage()}
        ${renderProjectModal()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindCalculatorEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "bomLists") {
    app.innerHTML = `
      <main class="app-shell bom-list-app-shell" data-layout="app-shell" data-layout-page="bomLists">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderBomListsPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindBomListsEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "operationMap") {
    app.innerHTML = `
      <main class="app-shell operation-map-app-shell" data-layout="app-shell" data-layout-page="operationMap">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderOperationMapPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindOperationMapEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "nomenclature") {
    app.innerHTML = `
      <main class="app-shell nomenclature-app-shell" data-layout="app-shell" data-layout-page="nomenclature">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderNomenclaturePage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindNomenclatureEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "routes") {
    app.innerHTML = `
      <main class="app-shell route-app-shell" data-layout="app-shell" data-layout-page="routes">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderRoutesPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindRoutesEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "speki") {
    app.innerHTML = `
      <main class="app-shell speki-app-shell" data-layout="app-shell" data-layout-page="speki">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderSpekiPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindSpekiEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "planning") {
    app.innerHTML = `
      <main class="app-shell planning-empty-app-shell" data-layout="app-shell" data-layout-page="planning">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderPlanningPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindPlanningEvents();
    bindConfirmEvents();
    return;
  }

  const scaleStart = fromDateInput(ui.windowStart);
  const scaleInfo = buildGanttScaleInfo(ui.scale, scaleStart, getTimelineCount(ui.scale, scaleStart));
  const rows = buildRows(scaleInfo);
  const rowLayout = buildRowLayout(rows);
  const slotPlacementMap = buildSlotPlacementMap(rows, scaleInfo);
  const warningsContext = getSlotWarnings(planningState);
  const stats = buildStats(warningsContext.warnings);

  app.innerHTML = `
    <main class="app-shell planning-app-shell planning-gantt-shell" data-layout="app-shell" data-layout-page="gantt">
      ${renderModuleMenu()}
      ${renderAppTopbar()}
      <section class="planner-workspace planner-workspace-gantt-only" data-layout="planning-page" aria-label="Рабочая область планирования">
        ${renderToolbar(scaleInfo, stats)}
        <section class="planner-frame" aria-label="Производственный план">
          <div class="gantt-shell" data-layout="gantt" data-gantt-shell>
            <div class="gantt-canvas" style="--left-width:${LEFT_WIDTH}px; --timeline-width:${scaleInfo.width}px; --total-height:${rowLayout.totalHeight}px;">
              ${renderTimeline(scaleInfo)}
              <div class="rows-layer" style="top:${TIMELINE_HEIGHT}px;">
                ${rows.map((row) => renderRow(row, rowLayout, scaleInfo, warningsContext.slotWarningMap, slotPlacementMap)).join("")}
              </div>
              ${renderDependencies(rows, rowLayout, scaleInfo, warningsContext.slotWarningMap, slotPlacementMap)}
              ${renderGanttSnapOverlay(rowLayout, scaleInfo, slotPlacementMap)}
            </div>
          </div>
        </section>
      </section>
      ${renderSlotDrawer(warningsContext.slotWarningMap)}
      ${renderEditorModal()}
      ${renderSplitModal()}
      ${renderProjectModal()}
      ${renderConfirmModal()}
    </main>
  `;

  bindGlobalNavigation();
  bindEvents(scaleInfo, rows, rowLayout);
  bindConfirmEvents();
  restoreScroll();
}

function getOperationMapRows() {
  return [...(directoryState.operationMap || [])]
    .filter((item) => item && item.id)
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "ru"));
}

function getOperationMapItem(operationId) {
  return getOperationMapRows().find((item) => item.id === operationId) || null;
}

function getOperationTypeOption(type) {
  return OPERATION_TYPE_OPTIONS.find((item) => item.value === type) || OPERATION_TYPE_OPTIONS[0];
}

function getOperationMapWorkCenterOptions() {
  return getPlanningWorkCenters().map((center) => ({
    value: center.id,
    label: center.name,
    meta: center.code || "подразделение",
  }));
}

function createBlankOperationMapItem() {
  const defaultCenter = getPlanningWorkCenters({ includeWarehouse: false })[0]
    || getPlanningWorkCenters()[0]
    || { id: "warehouse" };
  return {
    id: "",
    name: "",
    code: "",
    type: "production",
    workCenterId: defaultCenter.id,
    unitsPerHour: getWorkCenterUnitsPerHour(defaultCenter.id),
    requiresBatch: true,
    isWarehouse: defaultCenter.id === "warehouse",
    status: "Активен",
  };
}

function renderOperationMapPage() {
  const operations = getOperationMapRows();
  const isNew = ui.activeOperationId === "__new__";
  const activeOperation = isNew ? createBlankOperationMapItem() : getOperationMapItem(ui.activeOperationId);
  const hasPreview = isNew || Boolean(activeOperation);
  const routeUsageCount = (operationId) => planningState.routeSteps.filter((step) => step.operationId === operationId).length;

  return `
    <section class="operation-map-page module-data-page" data-layout="main-content" aria-label="Карта операций">
      <aside class="directory-sidebar module-data-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Технологии</span>
          <h1>Карта операций</h1>
        </div>
        <div class="module-sidebar-actions">
          <button class="primary-button" data-operation-create type="button">${icon("plus")}<span>Новая операция</span></button>
        </div>
        <div class="module-entity-list">
          <div class="module-list-label">Операции</div>
          ${isNew ? `<button class="module-entity-item is-active" type="button"><span><strong>Новая операция</strong><small>еще не сохранена</small></span><em>new</em></button>` : ""}
          ${operations.length ? operations.map((operation) => {
            const center = getWorkCenter(operation.workCenterId);
            const type = getOperationTypeOption(operation.type);
            return `
              <button class="module-entity-item ${operation.id === activeOperation?.id ? "is-active" : ""}" data-operation-open="${escapeAttribute(operation.id)}" type="button">
                <span>
                  <strong>${escapeHtml(operation.name || "Операция без названия")}</strong>
                  <small>${escapeHtml(type.label)} · ${escapeHtml(center?.name || "подразделение не выбрано")}</small>
                </span>
                <em>${routeUsageCount(operation.id)}</em>
              </button>
            `;
          }).join("") : `
            <div class="module-empty-note">
              <strong>Операций пока нет</strong>
              <span>Создайте первую операцию, затем используйте ее в маршрутной карте.</span>
            </div>
          `}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Карта операций</span>
            <h2>${escapeHtml(hasPreview ? (isNew ? "Новая операция" : activeOperation.name || "Операция без названия") : "Операция не выбрана")}</h2>
            <p>${escapeHtml(hasPreview ? "Операция задает подразделение по умолчанию и нормативы для маршрутных карт." : "Выберите операцию слева или создайте новую.")}</p>
          </div>
        </header>

        <div class="module-data-content operation-map-content">
          ${hasPreview ? renderOperationMapEditor(activeOperation, isNew, routeUsageCount(activeOperation.id)) : renderModulePreviewEmpty({
            iconName: "chart",
            title: "Предпросмотр пуст",
            text: "Выберите операцию в перечне или нажмите «Новая операция».",
          })}
        </div>
      </div>
    </section>
  `;
}

function renderOperationMapEditor(operation, isNew, usageCount) {
  const typeOptions = OPERATION_TYPE_OPTIONS;
  const workCenterOptions = getOperationMapWorkCenterOptions();
  const type = getOperationTypeOption(operation.type);
  const center = getWorkCenter(operation.workCenterId);

  return `
    <section class="module-panel operation-map-editor-panel">
      <div class="report-card-head">
        <strong>Карточка операции</strong>
        <span>${isNew ? "создание" : `${usageCount} связей в маршрутных картах`}</span>
      </div>
      <form id="operationMapForm" class="module-form operation-map-form">
        <input type="hidden" name="operationId" value="${escapeAttribute(operation.id || "")}" />
        <input type="hidden" name="isNew" value="${isNew ? "yes" : "no"}" />
        <label class="form-field full">
          <span>Название операции</span>
          <input name="name" value="${escapeAttribute(operation.name || "")}" placeholder="Например: SMT-монтаж" required />
        </label>
        <label class="form-field">
          <span>Код</span>
          <input name="code" value="${escapeAttribute(operation.code || "")}" placeholder="SMT-010" />
        </label>
        <label class="form-field">
          <span>Тип операции</span>
          <input type="hidden" name="type" data-operation-map-hidden="type" value="${escapeAttribute(operation.type || "production")}" />
          ${renderDenseInlineSelect("type", operation.type || "production", typeOptions, { type: "operationMapForm" })}
        </label>
        <label class="form-field">
          <span>Подразделение по умолчанию</span>
          <input type="hidden" name="workCenterId" data-operation-map-hidden="workCenterId" value="${escapeAttribute(operation.workCenterId || "")}" />
          ${renderDenseInlineSelect("workCenterId", operation.workCenterId || "", workCenterOptions, { type: "operationMapForm" })}
        </label>
        <label class="form-field">
          <span>Норматив, ед/час</span>
          <input name="unitsPerHour" type="number" min="0" step="1" value="${escapeAttribute(operation.unitsPerHour || "")}" placeholder="${escapeAttribute(getWorkCenterUnitsPerHour(operation.workCenterId || "smt"))}" />
        </label>
        <label class="operation-map-toggle">
          <input name="requiresBatch" type="checkbox" ${operation.requiresBatch ? "checked" : ""} />
          <span>Требует партийность</span>
        </label>
        <div class="operation-map-summary full">
          <span>${escapeHtml(type.label)}</span>
          <strong>${escapeHtml(center?.name || "Подразделение не выбрано")}</strong>
          <small>${operation.unitsPerHour ? `${Number(operation.unitsPerHour).toLocaleString("ru-RU")} ед/час` : "норматив возьмется из подразделения"}</small>
        </div>
        <div class="module-form-actions full">
          <button class="primary-button" type="submit">${icon("save")}<span>${isNew ? "Создать операцию" : "Сохранить операцию"}</span></button>
          ${isNew ? "" : `<button class="secondary-button danger" data-operation-delete="${escapeAttribute(operation.id)}" type="button">${icon("trash")}<span>Удалить</span></button>`}
        </div>
      </form>
    </section>
  `;
}

function renderPlanningPage() {
  const routes = getRoutesForModule();
  const activeRoute = getActiveRouteForModule();
  const activeProject = getProject(activeRoute?.specificationId || activeRoute?.projectId);
  const activeSpecification = getRouteSpecification(activeRoute);
  if (activeRoute && activeSpecification && ensureRouteTaskSeedSteps(activeRoute.id, activeSpecification)) {
    persistState();
  }
  const stats = getRouteModuleStats(activeRoute);
  const routeTasks = getRouteTasksForModule(activeRoute);
  const transferSummary = getPlanningRouteTransferSummary(activeRoute);
  const routeTitle = activeRoute?.name || "Маршрутная карта не выбрана";
  const specificationTitle = activeRoute
    ? activeSpecification?.name || getProjectDisplayName(activeProject) || "спецификация не выбрана"
    : "выберите карту слева";

  if (!routes.length) {
    return `
      <section class="planning-empty-page" data-layout="main-content" aria-label="Заказ на пр-во">
        <section class="planning-empty-panel">
          <div class="planning-empty-icon">${icon("calendar")}</div>
          <div>
            <span class="eyebrow">Новый модуль</span>
            <h2>Заказ на пр-во</h2>
            <p>Маршрутных карт пока нет. Создайте маршрутную карту в модуле «Маршрутная карта», затем передайте ее сюда кнопкой «В Заказ на пр-во».</p>
          </div>
        </section>
      </section>
    `;
  }

  return `
    <section class="planning-page module-data-page" data-layout="main-content" aria-label="Заказ на пр-во">
      <aside class="directory-sidebar module-data-sidebar planning-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Очередь</span>
          <h1>Заказ на пр-во</h1>
        </div>
        <div class="module-entity-list">
          <div class="module-list-label">Маршрутные карты</div>
          ${routes.map((route) => {
            const routeProject = getProject(route.projectId);
            const routeSpecification = getRouteSpecification(route);
            const steps = getRouteStepsForModule(route.id);
            return `
              <button class="module-entity-item ${route.id === activeRoute?.id ? "is-active" : ""}" data-planning-route-open="${escapeAttribute(route.id)}" type="button">
                <span>
                  <strong>${escapeHtml(route.name || "Маршрутная карта")}</strong>
                  <small>${escapeHtml(routeSpecification?.name || getProjectDisplayName(routeProject) || "спецификация не найдена")} · ${steps.length} шагов</small>
                </span>
                <em>${steps.length}</em>
              </button>
            `;
          }).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Маршрут в заказе на пр-во</span>
            <h2>${escapeHtml(routeTitle)}</h2>
            <p>${escapeHtml(activeRoute ? `${specificationTitle}: маршрутная карта передана в модуль заказа на пр-во для подготовки к Ганту.` : "Выберите маршрутную карту в перечне, чтобы настроить количество, партийность и передачу в Гант.")}</p>
          </div>
          <div class="directory-actions">
            <button class="primary-button" data-planning-route-to-gantt="${escapeAttribute(activeRoute?.id || "")}" type="button" ${activeRoute && transferSummary.steps.length ? "" : "disabled"}>
              ${icon("gantt")}<span>Передать в Гант</span>
            </button>
          </div>
        </header>

        <div class="module-data-content planning-route-content">
          ${activeRoute ? `
          <section class="module-panel planning-route-card">
            <div class="report-card-head">
              <strong>Принятая маршрутная карта</strong>
              <span>${escapeHtml(specificationTitle)}</span>
            </div>
            <div class="planning-route-meta">
              <article><span>Спецификация</span><strong>${escapeHtml(specificationTitle)}</strong><small>${escapeHtml(activeProject?.orderNumber || "заказ не задан")}</small></article>
              <article><span>Операций</span><strong>${stats.steps.length}</strong><small>${stats.required} обязательных</small></article>
              <article><span>Задач</span><strong>${routeTasks.length}</strong><small>из структуры спецификации</small></article>
              <article><span>Партий</span><strong>${transferSummary.batches.length}</strong><small>к размещению</small></article>
              <article><span>Мультипликаций</span><strong>${Number(transferSummary.totalPanels || 0).toLocaleString("ru-RU")}</strong><small>расчет для заказа</small></article>
              <article><span>В Ганте</span><strong>${transferSummary.planned}/${transferSummary.expected}</strong><small>${transferSummary.missing ? `${transferSummary.missing} осталось` : "все размещено"}</small></article>
            </div>
            <div class="planning-route-quantity">
              <label class="form-field">
                <span>Планируемое количество для Ганта</span>
                <input data-planning-quantity="${escapeAttribute(activeRoute?.id || "")}" type="number" min="1" step="1" value="${escapeAttribute(transferSummary.planningQuantity || 1)}" ${activeRoute ? "" : "disabled"} />
              </label>
              <div>
                <strong>${Number(transferSummary.planningQuantity || 1).toLocaleString("ru-RU")} шт.</strong>
                <small>количество партии для создания операций в Ганте</small>
              </div>
            </div>
            ${transferSummary.multiplicationRows.length ? `
              <div class="planning-multiplication-list" aria-label="Расчет мультипликаций для заказа на пр-во">
                ${transferSummary.multiplicationRows.map((row) => `
                  <article>
                    <div class="planning-multiplication-head">
                      <span>${escapeHtml(row.label)}</span>
                      <strong>${row.panels.toLocaleString("ru-RU")} мультипл.</strong>
                    </div>
                    <label class="planning-bpp-field">
                      <span>Плат в мультиплате</span>
                      <input
                        data-planning-boards-per-panel="${escapeAttribute(row.sourceId || row.id)}"
                        data-planning-bpp-route="${escapeAttribute(activeRoute?.id || "")}"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        step="1"
                        value="${escapeAttribute(row.boardsPerPanel)}"
                      />
                    </label>
                    <small>${row.boards.toLocaleString("ru-RU")} плат для заказа</small>
                  </article>
                `).join("")}
              </div>
            ` : ""}
            <div class="planning-route-note">
              ${icon("info")}
              <span>Заказ на пр-во теперь единственный вход для заданий в Гант. Кнопка «Передать в Гант» автоматически разложит операции по ближайшим доступным 15-минутным слотам с учетом подразделения, партии и последовательности задач.</span>
            </div>
          </section>

          ${renderPlanningBatchConstructor(activeRoute, transferSummary)}

          <section class="module-panel planning-route-steps">
            <div class="report-card-head">
              <strong>Последовательность операций</strong>
              <span>${stats.steps.length ? "маршрут готов к разложению по партиям" : "операции еще не заданы"}</span>
            </div>
            ${renderRouteModuleSequence(stats.steps, activeRoute)}
          </section>
          ` : `
          <section class="module-panel planning-route-card">
            <div class="report-card-head">
              <strong>Принятая маршрутная карта</strong>
              <span>маршрут не выбран</span>
            </div>
            ${renderModulePreviewEmpty({
              iconName: "calendar",
              title: "Маршрутная карта не выбрана",
              text: "Выберите карту слева или передайте ее сюда из модуля «Маршрутная карта», чтобы подготовить заказ к Ганту.",
            })}
          </section>
          `}
        </div>
      </div>
    </section>
  `;
}

function renderPlanningBatchConstructor(route, summary) {
  const batches = summary?.batches || [];
  const realBatches = batches.filter((batch) => batch.id !== "__pending__");
  const planningQuantity = normalizeQuantity(summary?.planningQuantity || getPlanningRouteQuantity(route));
  const batchQuantityTotal = normalizeQuantity(summary?.batchQuantityTotal || planningQuantity);
  const quantityDelta = Number(summary?.quantityDelta || 0);
  const deltaTone = quantityDelta === 0 ? "ok" : quantityDelta > 0 ? "warning" : "critical";
  const deltaLabel = quantityDelta === 0
    ? "совпадает"
    : `${quantityDelta > 0 ? "+" : ""}${quantityDelta.toLocaleString("ru-RU")} шт.`;
  const routeId = route?.id || "";

  return `
    <section class="module-panel planning-batch-constructor">
      <div class="report-card-head planning-batch-head">
        <div>
          <strong>Конструктор партий</strong>
          <span>соберите партии перед автоматическим размещением в Ганте</span>
        </div>
        <div class="planning-batch-actions">
          <button class="secondary-button" data-planning-batch-add="${escapeAttribute(routeId)}" type="button" ${route ? "" : "disabled"}>${icon("plus")}<span>Партия</span></button>
          <button class="secondary-button" data-planning-batches-distribute="${escapeAttribute(routeId)}" type="button" ${route ? "" : "disabled"}>${icon("refresh")}<span>Разделить поровну</span></button>
          <button class="secondary-button" data-planning-batches-accept-total="${escapeAttribute(routeId)}" type="button" ${route && realBatches.length ? "" : "disabled"}>${icon("check")}<span>Принять сумму</span></button>
        </div>
      </div>

      <div class="planning-batch-summary">
        <article>
          <span>План</span>
          <strong>${planningQuantity.toLocaleString("ru-RU")} шт.</strong>
          <small>целевое количество</small>
        </article>
        <article>
          <span>По партиям</span>
          <strong>${batchQuantityTotal.toLocaleString("ru-RU")} шт.</strong>
          <small>${realBatches.length || batches.length} партий</small>
        </article>
        <article class="${deltaTone}">
          <span>Разница</span>
          <strong>${escapeHtml(deltaLabel)}</strong>
          <small>${quantityDelta === 0 ? "можно передавать в Гант" : "проверьте партийность"}</small>
        </article>
        <article>
          <span>Слоты</span>
          <strong>${summary?.planned || 0}/${summary?.expected || 0}</strong>
          <small>операций в Ганте</small>
        </article>
      </div>

      <div class="planning-batch-table" role="table" aria-label="Конструктор партий">
        <div class="planning-batch-row is-head" role="row">
          <span>Партия</span>
          <span>Количество</span>
          <span>Гант</span>
          <span></span>
        </div>
        ${batches.map((batch) => {
          const isPending = batch.id === "__pending__";
          const slotsCount = isPending ? 0 : getPlanningBatchSlots(batch, route).length;
          return `
            <div class="planning-batch-row ${isPending ? "is-pending" : ""}" role="row">
              <label>
                <span>Партия</span>
                <input
                  data-planning-batch-field="batchNumber"
                  data-planning-batch-id="${escapeAttribute(batch.id)}"
                  type="text"
                  value="${escapeAttribute(batch.batchNumber || "")}"
                  ${isPending ? "disabled" : ""}
                />
              </label>
              <label>
                <span>Количество</span>
                <input
                  data-planning-batch-field="quantity"
                  data-planning-batch-id="${escapeAttribute(batch.id)}"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  value="${escapeAttribute(batch.quantity || 1)}"
                  ${isPending ? "disabled" : ""}
                />
              </label>
              <div class="planning-batch-state">
                <strong>${slotsCount ? `${slotsCount} слотов` : "не размещена"}</strong>
                <small>${slotsCount ? "уже есть в Ганте" : "будет создана при передаче"}</small>
              </div>
              <div class="planning-batch-row-actions">
                ${isPending ? `
                  <button class="secondary-button" data-planning-batch-add="${escapeAttribute(routeId)}" type="button">${icon("plus")}<span>Создать</span></button>
                ` : `
                  <button class="icon-button danger-soft" data-planning-batch-delete="${escapeAttribute(batch.id)}" type="button" title="Удалить партию">${icon("trash")}</button>
                `}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderTreePage() {
  const stats = getObjectTreeStats();
  const productionContexts = getProductionContexts();
  const layers = [
    { title: "Производство", value: productionContexts.length, meta: "спецификации, партии, слоты" },
    { title: "Технологии", value: (directoryState.specifications || []).length + (directoryState.bomLists || []).length, meta: "спеки, BOM, маршруты" },
    { title: "Справочники", value: getDirectoryObjectCount(), meta: "подразделения, ресурсы, сотрудники" },
  ];

  return `
    <section class="object-tree-page module-data-page" data-layout="main-content" aria-label="Дерево объектов системы">
      <aside class="directory-sidebar module-data-sidebar object-tree-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Просмотр</span>
          <h1>Дерево</h1>
        </div>
        <div class="object-tree-sidebar-summary">
          ${stats.slice(0, 4).map((item) => `
            <article>
              <strong>${escapeHtml(item.value)}</strong>
              <span>${escapeHtml(item.label)}</span>
            </article>
          `).join("")}
        </div>
        <div class="module-entity-list">
          <div class="module-list-label">Слои дерева</div>
          ${layers.map((layer) => `
            <article class="module-entity-item object-tree-layer">
              <span>
                <strong>${escapeHtml(layer.title)}</strong>
                <small>${escapeHtml(layer.meta)}</small>
              </span>
              <em>${Number(layer.value || 0).toLocaleString("ru-RU")}</em>
            </article>
          `).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Структура объектов</span>
            <h2>Дерево связей MES</h2>
            <p>Просмотр без редактирования: как спецификации, BOM, маршрутные карты, партии, слоты Ганта и справочники связаны между собой.</p>
          </div>
        </header>

        <div class="module-data-content object-tree-content">
          <section class="module-panel object-tree-kpi-panel">
            <div class="report-card-head">
              <strong>Карта объектов</strong>
              <span>сводка по текущему состоянию системы</span>
            </div>
            <div class="object-tree-kpi-grid">
              ${stats.map((item) => `
                <article>
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(item.value)}</strong>
                  <small>${escapeHtml(item.caption)}</small>
                </article>
              `).join("")}
            </div>
          </section>

          <section class="module-panel object-tree-view-panel">
            <div class="report-card-head">
              <strong>Дерево объектов системы</strong>
              <span>только просмотр, без изменения данных</span>
            </div>
            <div class="object-tree-wrap">
              ${renderSystemObjectTree()}
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function getObjectTreeStats() {
  const importedBomRows = (directoryState.bomLists || []).reduce((sum, bom) => sum + getBomImportRows(bom).length, 0);
  const productionCount = getProductionContexts().length;
  return [
    { label: "Спецификации", value: String((directoryState.specifications || []).length), caption: `${productionCount} в производстве` },
    { label: "BOM-листы", value: String((directoryState.bomLists || []).length), caption: `${importedBomRows.toLocaleString("ru-RU")} импортированных строк` },
    { label: "Маршрутные карты", value: String(planningState.routes.length), caption: `${planningState.routeSteps.length} операций` },
    { label: "Слоты Ганта", value: String(planningState.slots.length), caption: `${planningState.batches.length} партий` },
    { label: "Номенклатура", value: String((directoryState.nomenclature || []).length), caption: "позиции справочника" },
    { label: "Справочники", value: String(getDirectoryObjectCount()), caption: "записей инфраструктуры" },
  ];
}

function getDirectoryObjectCount() {
  return [
    planningState.workCenters,
    getProductionResources({ includeInactive: true }),
    directoryState.employees,
    directoryState.componentTypes,
    directoryState.norms,
    directoryState.statuses,
  ].reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

function renderSystemObjectTree() {
  return `
    <div class="object-tree-root">
      ${renderObjectTreeNode({
        title: "MES-система",
        meta: "единая структура объектов прототипа",
        badge: APP_VERSION,
        tone: "system",
        open: true,
        children: [
          renderProductionTree(),
          renderTechnologyTree(),
          renderDirectoryTree(),
        ],
      })}
    </div>
  `;
}

function renderProductionTree() {
  const productionContexts = getProductionContexts();
  const projectNodes = productionContexts.length
    ? productionContexts.map((project) => renderProductionProjectTree(project)).join("")
    : renderObjectTreeLeaf("Спецификации в производстве отсутствуют", "Создайте спецификацию и маршрутную карту, затем передайте маршрут в заказ на пр-во.", "empty");

  return renderObjectTreeNode({
    title: "Производство",
    meta: "объекты, которые участвуют в планировании и Ганте",
    badge: productionContexts.length,
    tone: "production",
    open: true,
    children: [projectNodes],
  });
}

function renderProductionProjectTree(project) {
  const specification = getSpecificationByProjectId(project.id);
  const routes = planningState.routes.filter((route) => route.specificationId === project.id || route.projectId === project.id);
  const batches = planningState.batches.filter((batch) => batch.specificationId === project.id || batch.projectId === project.id);
  const slots = planningState.slots.filter((slot) => slot.specificationId === project.id || slot.projectId === project.id);
  const routeNodes = routes.length
    ? routes.map((route) => renderRouteObjectTree(route)).join("")
    : renderObjectTreeLeaf("Маршрутная карта не создана", "Для передачи в заказ на пр-во нужен маршрут.", "warning");
  const batchNodes = batches.length
    ? batches.map((batch) => renderBatchObjectTree(batch, slots.filter((slot) => slot.batchId === batch.id))).join("")
    : renderObjectTreeLeaf("Партии не созданы", "Партии появятся при подготовке спецификации к производству.", "empty");

  return renderObjectTreeNode({
    title: getProjectDisplayName(project) || project.name || "Спецификация в производстве",
    meta: `${PROJECT_STATUS_LABELS[project.status] || project.status || "статус не задан"} · ${Number(project.totalQuantity || 0).toLocaleString("ru-RU")} шт.`,
    badge: project.orderNumber || "заказ",
    tone: "project",
    open: true,
    children: [
      specification
        ? renderSpecificationObjectTree(specification, { open: true, includeRoutes: false })
        : renderObjectTreeLeaf("Спецификация не связана", "Производственный объект есть, но карточка спецификации не найдена.", "warning"),
      renderObjectTreeNode({
        title: "Маршрутные карты",
        meta: `${routes.length} карт · ${routes.reduce((sum, route) => sum + getRouteStepsForModule(route.id).length, 0)} операций`,
        badge: routes.length,
        tone: "route",
        children: [routeNodes],
      }),
      renderObjectTreeNode({
        title: "Партии и слоты Ганта",
        meta: `${batches.length} партий · ${slots.length} слотов`,
        badge: slots.length,
        tone: "gantt",
        children: [batchNodes],
      }),
    ],
  });
}

function renderTechnologyTree() {
  return renderObjectTreeNode({
    title: "Технологии",
    meta: "исходные структуры для расчета и маршрутных карт",
    badge: (directoryState.specifications || []).length + (directoryState.bomLists || []).length,
    tone: "technology",
    open: true,
    children: [
      renderObjectTreeNode({
        title: "Спецификации",
        meta: "структура изделия и вложенные объекты",
        badge: (directoryState.specifications || []).length,
        tone: "specification",
        children: [(directoryState.specifications || []).length
          ? (directoryState.specifications || []).map((specification) => renderSpecificationObjectTree(specification)).join("")
          : renderObjectTreeLeaf("Спецификаций пока нет", "Создайте спецификацию в модуле «Спецификации».", "empty")],
      }),
      renderObjectTreeNode({
        title: "BOM-листы",
        meta: "компонентный состав печатных плат",
        badge: (directoryState.bomLists || []).length,
        tone: "bom",
        children: [(directoryState.bomLists || []).length
          ? (directoryState.bomLists || []).map((bom) => renderBomObjectTree(bom)).join("")
          : renderObjectTreeLeaf("BOM-листов пока нет", "Создайте BOM или импортируйте Excel-шаблон.", "empty")],
      }),
      renderObjectTreeNode({
        title: "Номенклатура",
        meta: "покупные и производимые позиции",
        badge: (directoryState.nomenclature || []).length,
        tone: "nomenclature",
        children: [(directoryState.nomenclature || []).length
          ? (directoryState.nomenclature || []).slice(0, 30).map((item) => renderObjectTreeLeaf(item.name || "Позиция без названия", `${item.article || "артикул не задан"} · ${item.type || "тип не задан"} · ${item.unit || "шт."}`, "nomenclature")).join("")
          : renderObjectTreeLeaf("Номенклатура пуста", "Добавьте позиции в модуле «Номенклатура».", "empty")],
      }),
    ],
  });
}

function renderSpecificationObjectTree(specification, options = {}) {
  const visitedSpecificationIds = new Set(options.visitedSpecificationIds || []);
  if (visitedSpecificationIds.has(specification.id)) {
    return renderObjectTreeLeaf(specification.name || "Повторная спецификация", "Повторная ссылка уже показана выше, ветка остановлена.", "warning");
  }
  visitedSpecificationIds.add(specification.id);
  const structureItems = getSpecificationStructureItems(specification);
  const productionQuantity = getSpecificationProductionQuantity(specification);
  return renderObjectTreeNode({
    title: specification.name || "Спецификация без названия",
    meta: `${specification.outputItem || "выход не задан"} · ${PROJECT_STATUS_LABELS[getSpecificationProductionStatus(specification)] || "статус не задан"} · ${Number(productionQuantity || 0).toLocaleString("ru-RU")} шт.`,
    badge: structureItems.length,
    tone: "specification",
    open: Boolean(options.open),
    children: [
      structureItems.length
        ? renderSpecificationStructureObjectTree(specification, structureItems, visitedSpecificationIds)
        : renderObjectTreeLeaf("Структура спецификации пуста", "Добавьте BOM, номенклатуру или узлы в модуле «Спецификации».", "warning"),
    ],
  });
}

function renderSpecificationStructureObjectTree(specification, items, visitedSpecificationIds = new Set()) {
  const childrenByParent = items.reduce((map, item) => {
    const parentId = item.parentId || "root";
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(item);
    return map;
  }, new Map());
  const visited = new Set();
  const renderBranch = (parentId, level = 0) => (childrenByParent.get(parentId) || [])
    .map((item) => {
      visited.add(item.id);
      return renderSpecificationItemObjectTree(item, renderBranch(item.id, level + 1), level, visitedSpecificationIds);
    })
    .join("");
  const rootItems = renderBranch("root");
  const orphanItems = items
    .filter((item) => !visited.has(item.id))
    .map((item) => renderSpecificationItemObjectTree(item, "", 0, visitedSpecificationIds))
    .join("");
  return rootItems + orphanItems;
}

function renderSpecificationItemObjectTree(item, nestedChildren = "", level = 0, visitedSpecificationIds = new Set()) {
  const bom = item.type === "bom" ? getBomList(item.bomListId) : null;
  const linkedSpecification = item.type === "specification"
    ? (directoryState.specifications || []).find((specification) => specification.id === item.specificationId)
    : null;
  const nomenclatureItem = item.type === "nomenclature"
    ? (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)
    : null;
  const title = bom?.name
    || linkedSpecification?.name
    || nomenclatureItem?.name
    || item.name
    || "Позиция без названия";
  const typeLabel = getSpecificationTreeItemTypeLabel(item.type);
  const executionLabel = item.executionType === "buy" ? "покупное" : "к обеспечению";
  const quantity = `${Number(item.quantity || 0).toLocaleString("ru-RU")} ${item.unit || "шт."}`;
  const metaParts = [typeLabel, executionLabel, quantity, item.operationName, item.departmentName].filter(Boolean);
  const extraChildren = [
    item.type === "bom" && bom ? renderBomObjectTree(bom, { compact: true }) : "",
    item.type === "specification" && linkedSpecification ? renderSpecificationObjectTree(linkedSpecification, { visitedSpecificationIds }) : "",
    nestedChildren,
  ].filter(Boolean).join("");

  return renderObjectTreeNode({
    title,
    meta: metaParts.join(" · "),
    badge: level > 0 ? `${level + 1} ур.` : typeLabel,
    tone: item.type || "item",
    children: [extraChildren || renderObjectTreeLeaf("Дочерних объектов нет", item.resultItem || item.note || "Конечная позиция структуры.", "empty")],
  });
}

function getSpecificationTreeItemTypeLabel(type) {
  const labels = {
    assembly: "узел",
    bom: "BOM",
    specification: "спецификация",
    nomenclature: "номенклатура",
    part: "позиция",
  };
  return labels[type] || "позиция";
}

function renderBomObjectTree(bom, options = {}) {
  const rows = getBomImportRows(bom);
  const componentTotal = Object.values(getBomComponentCounts(bom)).reduce((sum, count) => sum + Number(count || 0), 0);
  const linkedSpecifications = getBomLinkedSpecifications(bom.id);
  const rowPreview = rows.slice(0, options.compact ? 4 : 10).map((row) => (
    renderObjectTreeLeaf(
      row.description || row.manufacturerPart || row.designator || `Строка ${row.sequence || ""}`.trim(),
      `${row.designator || "позиция не задана"} · ${row.package || "типоразмер не задан"} · ${Number(row.quantity || 0).toLocaleString("ru-RU")} шт.`,
      "component",
    )
  )).join("");
  const hiddenCount = Math.max(0, rows.length - (options.compact ? 4 : 10));

  return renderObjectTreeNode({
    title: bom.name || "BOM без названия",
    meta: `${bom.boardCode || "код платы не задан"} · ${bom.resultItem || "результат не задан"} · ${componentTotal.toLocaleString("ru-RU")} компонентов`,
    badge: rows.length || "ручн.",
    tone: "bom",
    open: !options.compact,
    children: [
      renderObjectTreeLeaf("Результат BOM", bom.resultItem || "смонтированная печатная плата не задана", "output"),
      renderObjectTreeLeaf("Где используется", linkedSpecifications.length ? linkedSpecifications.map((specification) => specification.name).join(", ") : "пока не включен в спецификации", linkedSpecifications.length ? "link" : "empty"),
      rows.length
        ? renderObjectTreeNode({
          title: "Импортированные строки",
          meta: `${rows.length} строк до первой пустой ячейки A`,
          badge: rows.length,
          tone: "component",
          children: [rowPreview, hiddenCount ? renderObjectTreeLeaf(`Еще ${hiddenCount.toLocaleString("ru-RU")} строк`, "скрыто в компактном просмотре", "empty") : ""],
        })
        : renderObjectTreeLeaf("Импортированных строк нет", "BOM заполнен вручную или пока пустой.", "warning"),
    ],
  });
}

function renderRouteObjectTree(route) {
  const steps = getRouteStepsForModule(route.id);
  const tasks = getRouteTasksForModule(route);
  return renderObjectTreeNode({
    title: route.name || "Маршрутная карта",
    meta: `${getRouteSpecification(route)?.name || "спецификация не найдена"} · ${steps.length} операций`,
    badge: steps.length,
    tone: "route",
    children: [
      tasks.length ? tasks.map((task) => {
        const taskSteps = steps.filter((step) => getRouteStepTaskId(step) === task.id);
        return renderObjectTreeNode({
          title: task.name || "Задача маршрута",
          meta: `${getRouteTaskTypeLabel(task)} · ${taskSteps.length} операций`,
          badge: taskSteps.length,
          tone: "task",
          children: [taskSteps.map((step) => {
            const center = getWorkCenter(step.workCenterId);
            return renderObjectTreeLeaf(
              `${step.stepOrder}. ${step.operationName || center?.name || "Операция"}`,
              `${center?.name || "подразделение не найдено"} · ${Number(step.unitsPerHour || 0).toLocaleString("ru-RU")} изд./час`,
              "operation",
            );
          }).join("")],
        });
      }).join("") : steps.map((step) => {
        const center = getWorkCenter(step.workCenterId);
        return renderObjectTreeLeaf(`${step.stepOrder}. ${step.operationName || "Операция"}`, center?.name || "подразделение не найдено", "operation");
      }).join(""),
    ],
  });
}

function renderBatchObjectTree(batch, slots) {
  const slotsByCenter = slots.reduce((map, slot) => {
    const key = slot.workCenterId || "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(slot);
    return map;
  }, new Map());

  return renderObjectTreeNode({
    title: `Партия ${batch.batchNumber || batch.id}`,
    meta: `${Number(batch.quantity || 0).toLocaleString("ru-RU")} шт. · ${batch.status || "статус не задан"}`,
    badge: slots.length,
    tone: "batch",
    children: [slots.length
      ? [...slotsByCenter.entries()].map(([workCenterId, centerSlots]) => {
        const center = getWorkCenter(workCenterId);
        return renderObjectTreeNode({
          title: center?.name || "Подразделение не найдено",
          meta: `${centerSlots.length} слотов Ганта`,
          badge: centerSlots.length,
          tone: "gantt",
          children: [centerSlots
            .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))
            .map((slot) => renderObjectTreeLeaf(
              slot.operationName || "Операция",
              `${formatDateTimeShort(slot.plannedStart)} → ${formatDateTimeShort(slot.plannedEnd)} · ${STATUS_LABELS[slot.status] || slot.status || "статус"}`,
              "slot",
            ))
            .join("")],
        });
      }).join("")
      : renderObjectTreeLeaf("Слоты еще не размещены", "Передайте маршрут из модуля «Заказ на пр-во» в Гант.", "warning")],
  });
}

function renderDirectoryTree() {
  const unitNodes = (planningState.workCenters || []).map((unit) => {
    const employees = (directoryState.employees || []).filter((employee) => employee.department === unit.name);
    const typeLabel = UNIT_TYPE_LABELS[unit.unitType] || "Подразделение";
    const planningLabel = isPlanningWorkCenter(unit)
      ? `${Number(unit.unitsPerHour || 0).toLocaleString("ru-RU")} изд./час · ${unit.shift || "смена не задана"}`
      : "не участвует в Ганте";
    return renderObjectTreeNode({
      title: unit.name || "Подразделение без названия",
      meta: `${typeLabel} · ${unit.code || "код не задан"} · ${planningLabel}`,
      badge: employees.length,
      tone: isPlanningWorkCenter(unit) ? "workcenter" : "directory",
      children: [employees.length
        ? employees.map((employee) => renderObjectTreeLeaf(employee.name || "Сотрудник", `${employee.position || employee.role || "должность не задана"} · ${getRoleName(employee.roleId)}`, "employee")).join("")
        : renderObjectTreeLeaf("Сотрудников нет", "Подразделение пока пустое.", "empty")],
    });
  }).join("");

  return renderObjectTreeNode({
    title: "Справочники",
    meta: "производственная инфраструктура и права доступа",
    badge: getDirectoryObjectCount(),
    tone: "directory",
    open: true,
    children: [
      renderObjectTreeNode({
        title: "Подразделения и сотрудники",
        meta: "организация, ответственность и расчетные зоны",
        badge: planningState.workCenters.length,
        tone: "workcenter",
        children: [unitNodes || renderObjectTreeLeaf("Подразделений пока нет", "Заполните справочник подразделений.", "empty")],
      }),
      renderObjectTreeNode({
        title: "Производственные ресурсы",
        meta: `${getProductionResources({ includeInactive: true }).length} линий, постов и единиц оборудования`,
        badge: getProductionResources({ includeInactive: true }).length,
        tone: "resource",
        children: [
          ...getProductionResources({ includeInactive: true }).map((resource) => renderObjectTreeLeaf(resource.name || "Ресурс", `${PRODUCTION_RESOURCE_TYPE_LABELS[resource.type] || resource.type || "тип"} · ${getWorkCenter(resource.workCenterId)?.name || "подразделение не задано"} · ${resource.status || "статус"}`, "resource")),
        ].join("") || renderObjectTreeLeaf("Ресурсы не заполнены", "Добавьте производственные ресурсы в справочниках.", "empty"),
      }),
    ],
  });
}

function renderObjectTreeNode({ title, meta = "", badge = "", tone = "default", children = [], open = false }) {
  const content = Array.isArray(children) ? children.filter(Boolean).join("") : String(children || "");
  return `
    <details class="object-tree-node is-${escapeAttribute(tone)}" ${open ? "open" : ""}>
      <summary>
        <span class="object-tree-marker"></span>
        <span class="object-tree-title">
          <strong>${escapeHtml(title)}</strong>
          ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
        </span>
        ${badge !== "" && badge !== null && badge !== undefined ? `<em>${escapeHtml(String(badge))}</em>` : ""}
      </summary>
      <div class="object-tree-children">
        ${content}
      </div>
    </details>
  `;
}

function renderObjectTreeLeaf(title, meta = "", tone = "default") {
  return `
    <article class="object-tree-leaf is-${escapeAttribute(tone)}">
      <span class="object-tree-marker"></span>
      <span class="object-tree-title">
        <strong>${escapeHtml(title)}</strong>
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      </span>
    </article>
  `;
}

function formatDateTimeShort(value) {
  const date = toDate(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAuthEmployee() {
  return (directoryState.employees || []).find((employee) => employee.id === authState.employeeId)
    || (authState.employeeId === SYSTEM_AUTH_EMPLOYEE.id ? SYSTEM_AUTH_EMPLOYEE : null);
}

function getEmployeeRole(employee = getAuthEmployee()) {
  if (employee?.roleId === SYSTEM_AUTH_ROLE.id) return SYSTEM_AUTH_ROLE;
  return (directoryState.roles || []).find((role) => role.id === employee?.roleId)
    || (directoryState.roles || []).find((role) => role.id === "role-viewer")
    || (directoryState.roles || [])[0]
    || SYSTEM_AUTH_ROLE;
}

function getRoleName(roleId) {
  if (roleId === SYSTEM_AUTH_ROLE.id) return SYSTEM_AUTH_ROLE.name;
  return (directoryState.roles || []).find((role) => role.id === roleId)?.name || "Роль не задана";
}

function parseAccessList(value) {
  const text = String(value || "").trim();
  if (!text) return new Set();
  if (text === "*") return new Set(["*"]);
  return new Set(text.split(",").map((item) => item.trim()).filter(Boolean));
}

function roleAllowsValue(listValue, value) {
  const list = parseAccessList(listValue);
  return list.has("*") || list.has(value);
}

function getModuleDefinitions() {
  return [
    { id: "gantt", label: "Гант", icon: "gantt" },
    { id: "planning", label: "Заказ на пр-во", icon: "calendar" },
    { id: "operationMap", label: "Карта операций", icon: "chart" },
    { id: "speki", label: "Спецификации", icon: "book" },
    { id: "calculator", label: "Калькулятор", icon: "calculator" },
    { id: "routes", label: "Маршрутная карта", icon: "split" },
    { id: "bomLists", label: "BOM-листы", icon: "bom" },
    { id: "nomenclature", label: "Номенклатура", icon: "package" },
    { id: "directories", label: "Справочники", icon: "settings" },
  ];
}

function getModuleGroups(modules) {
  const groupMap = [
    { label: "Производство", ids: ["gantt", "planning"] },
    { label: "Технологии", ids: ["operationMap", "routes", "speki", "bomLists", "nomenclature"] },
    { label: "Система", ids: ["directories"] },
    { label: "MVP", ids: ["calculator"] },
  ];

  return groupMap
    .map((group) => ({
      ...group,
      modules: group.ids.map((id) => modules.find((moduleItem) => moduleItem.id === id)).filter(Boolean),
    }))
    .filter((group) => group.modules.length);
}

function getAvailableModules(role = getEmployeeRole()) {
  const modules = getModuleDefinitions().filter((moduleItem) => (
    roleAllowsValue(role?.modules, moduleItem.id)
  ));
  return modules.length ? modules : getModuleDefinitions().filter((moduleItem) => moduleItem.id === "gantt");
}

function ensureAuthorizedModule() {
  if (ui.activeModule === "dashboard" || ui.activeModule === "reports" || ui.activeModule === "debug") {
    ui.activeModule = "gantt";
  }
  if (ui.activeModule === "specifications") {
    ui.activeModule = "speki";
  }
  const availableModules = getAvailableModules();
  if (!availableModules.some((moduleItem) => moduleItem.id === ui.activeModule)) {
    ui.activeModule = availableModules[0]?.id || "gantt";
  }
}

function getVisibleDirectorySections() {
  const role = getEmployeeRole();
  const visibleSections = directorySections.filter((section) => roleAllowsValue(role?.directories, section.id));
  return visibleSections.length ? visibleSections : directorySections.filter((section) => section.id === "workCenters");
}

function getVisibleDirectoryGroups(visibleSections = getVisibleDirectorySections()) {
  const sectionById = new Map(visibleSections.map((section) => [section.id, section]));
  const groupedIds = new Set();
  const groups = directorySectionGroups
    .map((group) => {
      const sections = group.ids.map((id) => sectionById.get(id)).filter(Boolean);
      sections.forEach((section) => groupedIds.add(section.id));
      return { ...group, sections };
    })
    .filter((group) => group.sections.length);

  const otherSections = visibleSections.filter((section) => !groupedIds.has(section.id));
  if (otherSections.length) {
    groups.push({
      label: "Прочее",
      description: "служебные справочники",
      ids: otherSections.map((section) => section.id),
      sections: otherSections,
    });
  }

  return groups;
}

function renderAuthPage() {
  const directoryEmployees = (directoryState.employees || []).filter((employee) => employee.status !== "Уволен");
  const employees = directoryEmployees.length ? directoryEmployees : [SYSTEM_AUTH_EMPLOYEE];
  const defaultEmployee = employees.find((employee) => employee.roleId === "role-admin") || employees[0];

  return `
    <main class="auth-shell" aria-label="Авторизация MES">
      <section class="auth-card">
        <div class="auth-card-head">
          <span class="eyebrow">Авторизация</span>
          <h1>Вход по ФИО</h1>
          <p>${directoryEmployees.length ? "Для отладки пароль у всех сотрудников пока пустой. Оставьте поле пароля пустым и выберите сотрудника." : "Справочник сотрудников пуст. Доступен служебный вход администратора без записи в справочнике."}</p>
        </div>
        <form class="auth-form" id="authForm">
          <label class="form-field command-field">
            <span>ФИО сотрудника</span>
            <select name="employeeId" required>
              ${employees.map((employee) => {
                const role = getEmployeeRole(employee);
                return `<option value="${employee.id}" ${selected(defaultEmployee?.id, employee.id)}>${escapeHtml(employee.name)} · ${escapeHtml(role?.name || "роль не задана")}</option>`;
              }).join("")}
            </select>
          </label>
          <label class="form-field">
            <span>Пароль</span>
            <input name="password" type="password" placeholder="Пустой пароль для отладки" autocomplete="current-password" />
          </label>
          <div class="auth-hint">
            ${icon("lock")}
            <span>Права доступа берутся из справочника ролей, назначение роли выполняется в справочнике сотрудников.</span>
          </div>
          <button class="primary-button" type="submit">${icon("unlock")}<span>Войти в систему</span></button>
        </form>
      </section>
    </main>
  `;
}

function renderModuleMenu() {
  const employee = getAuthEmployee();
  const role = getEmployeeRole(employee);
  const modules = getAvailableModules(role);
  const groups = getModuleGroups(modules);

  return `
    <nav class="module-menu" data-layout="sidebar" aria-label="Основное меню">
      <div class="module-menu-brand">
        <strong>MES</strong>
        <span>${APP_VERSION}</span>
      </div>
      <div class="module-tabs" role="tablist">
        ${groups.map((group) => `
          <div class="module-group">
            <span class="module-group-title">${escapeHtml(group.label)}</span>
            ${group.modules.map((moduleItem) => `
              <button class="module-tab ${ui.activeModule === moduleItem.id ? "is-active" : ""}" data-module="${moduleItem.id}" type="button" aria-label="${escapeAttribute(moduleItem.label)}" title="${escapeAttribute(moduleItem.label)}">
                ${icon(moduleItem.icon)}<span>${escapeHtml(moduleItem.label)}</span>
              </button>
            `).join("")}
          </div>
        `).join("")}
      </div>
      <div class="module-menu-meta auth-menu-meta">
        <div class="auth-user-chip">
          ${icon("lock")}
          <span><strong>${escapeHtml(employee?.name || "Пользователь")}</strong><small>${escapeHtml(role?.name || "Роль не задана")}</small></span>
        </div>
        <button class="module-logout-button" data-auth-logout type="button" title="Выйти из системы">${icon("unlock")}</button>
      </div>
    </nav>
  `;
}

function renderAppTopbar() {
  const employee = getAuthEmployee();
  const role = getEmployeeRole(employee);
  const activeModule = getModuleDefinitions().find((moduleItem) => moduleItem.id === ui.activeModule) || getModuleDefinitions()[0];
  const activeContext = ui.activeModule === "directories"
      ? directorySections.find((section) => section.id === ui.activeDirectory)?.label || "Справочники"
      : activeModule.label;

  return `
    <header class="app-topbar" data-layout="header" aria-label="Верхняя панель MES">
      <div class="app-breadcrumbs">
        <span>MES</span>
        <i>/</i>
        <strong>${escapeHtml(activeModule.label)}</strong>
        ${activeContext && activeContext !== activeModule.label ? `<i>/</i><span>${escapeHtml(activeContext)}</span>` : ""}
      </div>
      <div class="app-topbar-title">
        <h1>${escapeHtml(activeModule.label)}</h1>
        <p>${escapeHtml(activeContext)}</p>
      </div>
      <label class="app-global-search">
        ${icon("search")}
        <input type="search" placeholder="Поиск по спецификациям, операциям, справочникам" aria-label="Глобальный поиск" />
      </label>
      <div class="app-topbar-actions">
        <span class="app-time" data-clock>${formatDateTime(ui.now)}</span>
        <div class="app-topbar-user">
          <strong>${escapeHtml(employee?.name || "Пользователь")}</strong>
          <span>${escapeHtml(role?.name || "Роль не задана")}</span>
        </div>
      </div>
    </header>
  `;
}

function renderCalculatorPage() {
  const calc = calculateComplexityResult();
  const inputStatus = getCalculatorInputStatus(calc);
  const bomOptions = [
    { value: "", label: "Выберите BOM-лист", meta: "из модуля BOM-листы" },
    ...(directoryState.bomLists || []).map((bom) => ({
      value: bom.id,
      label: bom.name || "BOM без названия",
      meta: [bom.boardCode, bom.resultItem].filter(Boolean).join(" · ") || "компонентный состав",
    })),
  ];
  const smtLineOptions = [
    { value: "", label: "Выберите SMT-линию", meta: "конфигурация линии для расчета" },
    ...getSmtLineConfigurations().map((line) => ({
      value: line.id,
      label: line.name,
      meta: `${Number(getResourceBaseCph(line) || 0).toLocaleString("ru-RU")} комп./ч · переналадка ${Number(line.changeoverMin || 0).toLocaleString("ru-RU")} мин`,
    })),
  ];
  const componentRows = inputStatus.complete
    ? (calc.rows?.length ? calc.rows : buildBomPreviewRows(calc))
    : [];
  const componentTotal = componentRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const totalPlacements = componentRows.reduce((sum, row) => sum + Number(row.totalPlacements || 0), 0);
  const activeTypes = componentRows.filter((row) => Number(row.count || 0) > 0).length;
  const efficiencyValue = Math.round(Number(calculatorState.efficiency || calc.smtLine?.efficiency || 100));
  const selectedLineValue = calc.smtLine?.id || calculatorState.resourceId || "";
  const selectedLineCaption = calc.smtLine
    ? `${Number(getResourceBaseCph(calc.smtLine) || 0).toLocaleString("ru-RU")} комп./ч · ${Number(calc.smtLine.changeoverMin || 0).toLocaleString("ru-RU")} мин переналадки · эффективность ${efficiencyValue}%`
    : "выберите конфигурацию SMT-линии для расчета";
  const saveCaption = calculatorState.inputsSavedAt
    ? `сохранено ${formatDateTime(calculatorState.inputsSavedAt)}`
    : "расчет не сохранен";

  return `
    <section class="calculator-page" data-layout="main-content" aria-label="Калькулятор SMT-операции">
      <div class="calculator-workspace" data-layout="page-workspace">
        <header class="calculator-header">
          <div>
            <span class="eyebrow">SMT расчет</span>
            <h1>Калькулятор SMT-операции</h1>
            <p>Выберите BOM из модуля BOM-листы, конфигурацию SMT-линии и параметры запуска. Результат расчета - длительность одной SMT-операции.</p>
          </div>
          <div class="calculator-header-metrics">
            <span class="status-pill neutral">${calc.panelCount.toLocaleString("ru-RU")} мультипл.</span>
            <span class="status-pill neutral">${activeTypes} типов</span>
            <span class="status-pill ok">${formatDuration(calc.totalMs)}</span>
          </div>
        </header>

        <div class="calculator-simple-grid">
          <section class="calculator-panel calculator-input-panel calculator-smt-input-panel">
            <div class="report-card-head">
              <strong>Входные данные</strong>
              <span>${inputStatus.complete ? "готово к расчету SMT" : "выберите BOM, линию и количество"}</span>
            </div>
            <div class="calculator-form-grid calculator-input-grid">
              <div class="field">
                <span>BOM-лист</span>
                ${renderDenseInlineSelect("bomListId", calculatorState.bomListId, bomOptions, { type: "calc" })}
              </div>
              <div class="field">
                <span>Конфигурация SMT-линии</span>
                ${renderDenseInlineSelect("resourceId", selectedLineValue, smtLineOptions, { type: "calc" })}
              </div>
              <label class="field">
                <span>Плат в заказе</span>
                <input data-calc-number="boardQuantity" type="number" min="1" step="1" value="${calculatorState.boardQuantity === "" ? "" : calc.boardQuantity}" placeholder="введите" />
              </label>
              <label class="field">
                <span>Плат в мультипликации</span>
                <input data-calc-number="boardsPerPanel" type="number" min="1" step="1" value="${calculatorState.boardsPerPanel === "" ? "" : calc.boardsPerPanel}" placeholder="например 4" />
              </label>
              <label class="field readonly">
                <span>Мультипликаций</span>
                <input readonly value="${calc.panelCount.toLocaleString("ru-RU")} шт." />
              </label>
              <label class="field">
                <span>Эффективность линии, %</span>
                <input data-calc-number="efficiency" type="number" min="10" max="150" step="1" value="${efficiencyValue}" />
              </label>
              <div class="calculator-smt-line-card full">
                <strong>${escapeHtml(calc.smtLine?.name || "SMT-линия не выбрана")}</strong>
                <span>${escapeHtml(selectedLineCaption)}</span>
              </div>
            </div>
            <div class="calculator-panel-actions calculator-input-actions">
              <span>${escapeHtml(saveCaption)}</span>
              <button class="secondary-button" data-save-calculator-inputs type="button" ${inputStatus.complete ? "" : "disabled"}>${icon("save")}<span>Сохранить входные данные</span></button>
            </div>
          </section>

          <section class="calculator-panel calculator-result-panel calculator-smt-result-panel">
            <div class="report-card-head">
              <strong>Результат расчета SMT</strong>
              <span>${inputStatus.complete ? escapeHtml(calc.bomList?.name || "BOM") : "расчет появится после заполнения вводных"}</span>
            </div>
            <div class="calculator-kpis">
              <article><span>Компонентов / плата</span><strong>${componentTotal.toLocaleString("ru-RU")}</strong><small>${activeTypes} типов компонентов</small></article>
              <article><span>Установок на заказ</span><strong>${totalPlacements.toLocaleString("ru-RU")}</strong><small>${calc.boardQuantity.toLocaleString("ru-RU")} плат</small></article>
              <article><span>На плату</span><strong>${formatSecondsDuration(calc.perBoardSeconds)}</strong><small>${formatCalculatorNumber(calc.flowBoardsPerHour)} плат/ч</small></article>
              <article><span>На мультипликацию</span><strong>${formatSecondsDuration(calc.perPanelSeconds)}</strong><small>${calc.boardsPerPanel.toLocaleString("ru-RU")} плат</small></article>
              <article><span>Переналадка</span><strong>${formatDuration(calc.setupMs)}</strong><small>${escapeHtml(calc.smtLine?.name || "SMT-линия не выбрана")}</small></article>
              <article><span>На заказ</span><strong>${formatDuration(calc.totalMs)}</strong><small>${calc.panelCount.toLocaleString("ru-RU")} мультипликаций</small></article>
            </div>
          </section>

          <section class="calculator-panel component-matrix-panel calculator-smt-component-panel">
            <div class="directory-table-toolbar">
              <strong>Расчет по компонентам BOM</strong>
              <span>${componentRows.length ? `${componentRows.length} типов · ${totalPlacements.toLocaleString("ru-RU")} установок` : "выберите BOM и параметры запуска"}</span>
            </div>
            <div class="directory-table-wrap" data-layout="table">
              <table class="directory-table calculator-table bom-table">
                <thead>
                  <tr>
                    <th>Тип компонента</th>
                    <th>Корпус</th>
                    <th>BOM / плата</th>
                    <th>Коэф.</th>
                    <th>Эфф. скорость</th>
                    <th>1 плата</th>
                    <th>1 мультипл.</th>
                    <th>Заказ</th>
                  </tr>
                </thead>
                <tbody>
                  ${componentRows.length ? componentRows.map((row) => `
                    <tr>
                      <td class="primary-cell">
                        <span class="component-name">${escapeHtml(row.type.name)}</span>
                        <small>${escapeHtml(row.type.family || "")}</small>
                      </td>
                      <td>${escapeHtml(row.type.package || "-")}</td>
                      <td><span class="readonly-token">${row.count.toLocaleString("ru-RU")} шт.</span></td>
                      <td>${formatCalculatorNumber(row.coefficient)}</td>
                      <td>${formatCalculatorNumber(row.effectiveCph)} комп./ч</td>
                      <td>${formatSecondsDuration(row.secondsPerBoard)}</td>
                      <td>${formatSecondsDuration(row.secondsPerPanel)}</td>
                      <td>${row.totalPlacements.toLocaleString("ru-RU")}</td>
                    </tr>
                  `).join("") : `
                    <tr>
                      <td class="primary-cell" colspan="8">
                        <span class="component-name">Расчет пока пустой</span>
                        <small>Выберите BOM-лист, SMT-линию, количество плат и плат в мультипликации.</small>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderCalculatorProjectBindings(calc, visibilityAttr = "") {
  const rows = (directoryState.specifications || []).map((specification) => {
    const project = getSpecificationProductionProject(specification);
    const bomEntries = specification ? getSpecificationBomEntries(specification.id) : [];
    const route = project
      ? planningState.routes.find((item) => item.projectId === project.id && item.isDefault)
        || planningState.routes.find((item) => item.projectId === project.id)
      : null;
    const routeSteps = route ? planningState.routeSteps.filter((step) => step.routeId === route.id) : [];
    const batches = project ? planningState.batches.filter((batch) => batch.projectId === project.id) : [];
    const slots = project ? planningState.slots.filter((slot) => slot.projectId === project.id) : [];
    const isActive = specification.id === calc.specification?.id;
    const bomSummary = bomEntries.length
      ? `${bomEntries.length} BOM · ${bomEntries.map((entry) => `${entry.quantity}x ${entry.bom.name}`).join(", ")}`
      : "BOM не привязан";
    const specificationSummary = specification
      ? `${specification.name} · ${specification.outputItem}`
      : "спецификация не привязана";
    const routeSummary = routeSteps.length
      ? `${routeSteps.length} оп. · ${route?.name || "маршрут"}`
      : "маршрут не сохранен";
    const launchSummary = `${Number(getSpecificationProductionQuantity(specification) || 0).toLocaleString("ru-RU")} шт. · ${batches.length} парт. · ${slots.length} слотов`;
    return {
      project,
      specification,
      bomEntries,
      route,
      routeSteps,
      batches,
      slots,
      isActive,
      bomSummary,
      specificationSummary,
      routeSummary,
      launchSummary
    };
  });

  return `
    <section class="calculator-panel project-bindings-panel" data-calculator-block="bindings"${visibilityAttr}>
      <div class="directory-table-toolbar">
        <strong>Текущие спецификации</strong>
        <span>спецификация, BOM, маршрут и запуск</span>
      </div>
      <div class="project-list-table" role="list">
        ${rows.map((row) => `
          <article class="project-list-row ${row.isActive ? "is-active" : ""}" role="listitem">
            <div class="project-list-main">
              <strong>${escapeHtml(row.specification.name)}</strong>
              <small>${escapeHtml(getSpecificationProductionOrder(row.specification) || "заказ не задан")} · ${escapeHtml(PROJECT_STATUS_LABELS[getSpecificationProductionStatus(row.specification)] || "Статус")} · срок ${formatDate(getSpecificationProductionDueDate(row.specification))}</small>
            </div>
            <div class="project-list-meta">
              <span><b>Изделие</b>${escapeHtml(row.specification.outputItem || "-")}</span>
              <span><b>BOM</b>${escapeHtml(row.bomSummary)}</span>
              <span><b>Маршрут</b>${escapeHtml(row.routeSummary)}</span>
              <span><b>Запуск</b>${escapeHtml(row.launchSummary)}</span>
            </div>
            <button class="secondary-button" data-load-calculator-project="${row.project?.id || ""}" data-load-calculator-specification="${row.specification.id}" type="button">${icon("play")}<span>${row.isActive ? "Открыта" : "Открыть"}</span></button>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderCalculatorSavePanel(calc, visibilityAttr = "") {
  const routeReady = calc.operationResults.length > 0;
  const savedReady = Boolean(calculatorState.lastSavedAt) && routeReady;
  const route = calc.project
    ? planningState.routes.find((item) => item.projectId === calc.project.id && item.isDefault)
      || planningState.routes.find((item) => item.projectId === calc.project.id)
    : null;
  const routeSteps = route ? planningState.routeSteps.filter((step) => step.routeId === route.id) : [];
  const projectSlots = calc.project ? planningState.slots.filter((slot) => slot.projectId === calc.project.id) : [];

  return `
    <section class="calculator-panel calculator-save-panel" data-calculator-block="save"${visibilityAttr}>
      <div class="report-card-head">
        <strong>Передача в план</strong>
        <span>${savedReady ? `сохранено ${formatDateTime(calculatorState.lastSavedAt)}` : "сохраните маршрут спецификации для Ганта"}</span>
      </div>
      <div class="calculator-kpis">
        <article>
          <span>Спецификация</span>
          <strong>${escapeHtml(calc.specification?.name || "-")}</strong>
          <small>${escapeHtml(getSpecificationProductionOrder(calc.specification) || "заказ не задан")}</small>
        </article>
        <article>
          <span>Маршрут</span>
          <strong>${routeReady ? `${calc.operationResults.length} оп.` : "нет"}</strong>
          <small>${routeSteps.length ? `${routeSteps.length} шагов уже в плане` : "будет создан при сохранении"}</small>
        </article>
        <article>
          <span>Расчет заказа</span>
          <strong>${formatDuration(calc.totalMs)}</strong>
          <small>${calc.panelCount.toLocaleString("ru-RU")} мультипликаций</small>
        </article>
        <article>
          <span>Гант</span>
          <strong>${projectSlots.length}</strong>
          <small>слотов спецификации в плане</small>
        </article>
      </div>
      <div class="calculator-save-summary">
        <div>
          ${icon(savedReady ? "check" : "info")}
          <span>${savedReady
            ? "Маршрутная карта сохранена в спецификацию. Следующий шаг - постановка операций на диаграмму Ганта."
            : routeReady
              ? "Проверьте маршрут и сохраните его в спецификацию, чтобы заказ на пр-во использовал актуальные операции."
              : "Сначала сформируйте маршрутную карту на этапе 04."}</span>
        </div>
      </div>
      <div class="calculator-panel-actions">
        <button class="primary-button" data-calculator-save-route type="button" ${routeReady ? "" : "disabled"}>${icon("save")}<span>Сохранить маршрут спецификации</span></button>
      </div>
    </section>
  `;
}

function renderProjectReadinessPanel(calc) {
  const project = calc.project;
  const specification = calc.specification;
  const bomEntries = specification ? getSpecificationBomEntries(specification.id) : [];
  const routeSteps = project ? getProjectRouteSteps(project.id, planningState) : [];
  const plannedSlots = project ? planningState.slots.filter((slot) => slot.projectId === project.id) : [];
  const backlog = project ? buildBacklogItems(120).filter((item) => item.project.id === project.id) : [];
  const stages = [
    {
      code: "01",
      title: "Спецификация",
      status: specification ? "Готова" : "Нет спецификации",
      complete: Boolean(project),
      meta: specification ? `${getSpecificationProductionOrder(specification) || "заказ не задан"} · ${Number(getSpecificationProductionQuantity(specification) || 0).toLocaleString("ru-RU")} шт.` : "выберите спецификацию",
    },
    {
      code: "02",
      title: "Спецификация",
      status: specification ? "Привязана" : "Нет СП",
      complete: Boolean(specification),
      meta: specification?.outputItem || "состав изделия не выбран",
    },
    {
      code: "03",
      title: "BOM",
      status: bomEntries.length ? `${bomEntries.length} BOM` : "Нет BOM",
      complete: bomEntries.length > 0,
      meta: bomEntries.length
        ? bomEntries.map((entry) => `${entry.quantity}x ${entry.bom.name}`).join(" · ")
        : "SMT-состав не задан",
    },
    {
      code: "04",
      title: "Маршрут",
      status: routeSteps.length ? `${routeSteps.length} оп.` : "Нет маршрута",
      complete: routeSteps.length > 0,
      meta: routeSteps.length ? "маршрутная карта сохранена" : "сформируйте маршрут",
    },
    {
      code: "05",
      title: "План",
      status: backlog.length ? `${backlog.length} в очереди` : plannedSlots.length ? "Размещен" : "Нет слотов",
      complete: plannedSlots.length > 0 && backlog.length === 0,
      warning: backlog.length > 0,
      meta: `${plannedSlots.length} слотов · ${backlog.length} без размещения`,
    },
  ];

  return `
    <section class="calculator-panel project-readiness-panel">
      <div class="directory-table-toolbar">
        <strong>Готовность спецификации</strong>
        <span>${escapeHtml(specification?.name || "сквозной сценарий подготовки")}</span>
      </div>
      <div class="project-readiness-steps">
        ${stages.map((stage) => `
          <article class="${stage.complete ? "is-done" : stage.warning ? "is-warning" : ""}">
            <b>${stage.code}</b>
            <div>
              <strong>${escapeHtml(stage.title)}</strong>
              <small>${escapeHtml(stage.meta)}</small>
            </div>
            <em>${escapeHtml(stage.status)}</em>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSpecificationBomPlan(calc, visibilityAttr = "") {
  const bomEntries = calc.specification
    ? getSpecificationBomEntries(calc.specification.id)
    : calculatorState.noSpecification && calc.bomList
      ? [{ bom: calc.bomList, quantity: 1, boardsPerPanel: calc.boardsPerPanel || 1, slot: "PCB" }]
      : [];
  const rows = bomEntries.map((entry, index) => {
    const boards = Number(calc.boardQuantity || 0) * Number(entry.quantity || 0);
    const boardsPerPanel = normalizeBoardsPerPanel(entry.boardsPerPanel, calc.boardsPerPanel || 1);
    const panels = boardsPerPanel > 0 ? Math.ceil(boards / boardsPerPanel) : 0;
    const operation = calc.operationResults.find((result) => result.bomListId === entry.bom.id)
      || getRouteOperations().find((item) => item.bomListId === entry.bom.id);
    return {
      index: index + 1,
      entry,
      boards,
      boardsPerPanel,
      panels,
      operation,
    };
  });

  return `
    <section class="calculator-panel spec-bom-plan-panel" data-calculator-block="specBom"${visibilityAttr}>
      <div class="directory-table-toolbar">
        <strong>BOM из спецификации</strong>
        <span>${rows.length ? "каждый BOM станет отдельной SMT-операцией" : "BOM пока не привязаны"}</span>
      </div>
      <div class="spec-bom-plan-list">
        ${rows.length ? rows.map((row) => `
          <article>
            <span>${String(row.index).padStart(2, "0")}</span>
            <div>
              <strong>${escapeHtml(row.entry.bom.name)}</strong>
              <small>${escapeHtml(row.entry.bom.resultItem || row.entry.bom.boardCode || "результат BOM")}</small>
            </div>
            <em>${row.entry.quantity}x в изделии</em>
            <em>${row.boards.toLocaleString("ru-RU")} плат</em>
            <em>${row.boardsPerPanel.toLocaleString("ru-RU")} плат/мульт.</em>
            <em>${row.panels.toLocaleString("ru-RU")} мультипл.</em>
            <b>${row.operation ? formatDuration(row.operation.totalMs || 0) : "нет операции"}</b>
          </article>
        `).join("") : `
          <div class="calculator-empty-panel compact">
            ${icon("info")}
            <strong>BOM не найдены</strong>
            <span>Заполните спецификацию изделия в справочнике.</span>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderDenseInlineSelect(name, value, items, options = {}) {
  const selectedItem = items.find((item) => String(item.value) === String(value))
    || items[0]
    || { value: "", label: "Не выбрано", meta: "" };
  const rootAttribute = options.type === "specStructureBom"
    ? `data-dense-spec-structure-bom="${escapeAttribute(options.itemId || "")}"`
    : options.type === "specStructureParent"
      ? `data-dense-spec-structure-parent="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureType"
      ? `data-dense-speki-structure-type="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureBom"
      ? `data-dense-speki-structure-bom="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureSpecification"
      ? `data-dense-speki-structure-specification="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureNomenclature"
      ? `data-dense-speki-structure-nomenclature="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureExecution"
      ? `data-dense-speki-structure-execution="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureOperation"
      ? `data-dense-speki-structure-operation="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureDepartment"
      ? `data-dense-speki-structure-department="${escapeAttribute(options.itemId || "")}"`
    : options.type === "routeStep"
    ? `data-dense-route-step-field="${escapeAttribute(name)}" data-route-step-id="${escapeAttribute(options.stepId || "")}"`
    : options.type === "operationMapForm"
      ? `data-dense-operation-map-field="${escapeAttribute(name)}"`
    : options.type === "routeModule"
      ? `data-dense-route-field="${escapeAttribute(name)}"`
      : options.type === "route"
        ? `data-dense-route-op-field="${escapeAttribute(name)}"`
        : options.type === "bomNomenclature"
          ? `data-dense-bom-nomenclature="${escapeAttribute(options.bomId || "")}"`
        : options.type === "nomenclatureType"
          ? `data-dense-nomenclature-type="${escapeAttribute(name)}"`
        : options.type === "toolbar"
          ? `data-dense-toolbar-select="${escapeAttribute(name)}"`
          : `data-dense-calc-select="${escapeAttribute(name)}"`;
  const actionClass = items.some((item) => item.action) ? " has-actions" : "";

  return `
    <details class="dense-inline-select${options.type ? ` dense-select-${escapeAttribute(options.type)}` : ""}${actionClass}" ${rootAttribute}>
      <summary>
        <span>
          <strong>${escapeHtml(selectedItem.label)}</strong>
          ${selectedItem.meta ? `<small>${escapeHtml(selectedItem.meta)}</small>` : ""}
        </span>
        ${icon("chevronDown")}
      </summary>
      <div class="dense-inline-options">
        ${items.map((item) => `
          <button class="${String(item.value) === String(value) ? "is-selected" : ""} ${item.action ? "is-command" : ""}" data-dense-value="${escapeAttribute(item.value)}" ${item.action ? `data-dense-action="${escapeAttribute(item.action)}"` : ""} type="button">
            <strong>${escapeHtml(item.label)}</strong>
            ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
          </button>
        `).join("")}
      </div>
    </details>
  `;
}

function getCalculatorInputStatus(calc = calculateComplexityResult()) {
  const boardQuantity = Number(calculatorState.boardQuantity || 0);
  const boardsPerPanel = Number(calculatorState.boardsPerPanel || 0);
  const status = {
    bom: Boolean(calc.bomList),
    smtLine: Boolean(calc.smtLine),
    boardQuantity: Number.isFinite(boardQuantity) && boardQuantity > 0,
    boardsPerPanel: Number.isFinite(boardsPerPanel) && boardsPerPanel > 0,
  };
  status.complete = Object.values(status).every(Boolean);
  return status;
}

function isCalculatorInputsComplete() {
  return getCalculatorInputStatus(calculateComplexityResult()).complete;
}

function getCalculatorInputsSignature() {
  return JSON.stringify({
    projectId: calculatorState.projectId || "",
    specificationId: calculatorState.specificationId || "",
    noSpecification: Boolean(calculatorState.noSpecification),
    bomListId: calculatorState.bomListId || "",
    workCenterId: calculatorState.workCenterId || "",
    resourceId: calculatorState.resourceId || "",
    boardQuantity: normalizeOptionalPositiveInteger(calculatorState.boardQuantity) || "",
    boardsPerPanel: normalizeOptionalPositiveInteger(calculatorState.boardsPerPanel) || "",
    efficiency: Math.round(Number(calculatorState.efficiency || 0) * 100) / 100,
  });
}

function isCalculatorInputsDirty() {
  return !calculatorState.inputsSavedSignature || calculatorState.inputsSavedSignature !== getCalculatorInputsSignature();
}

function getCalculatorRouteSignature() {
  return JSON.stringify(getRouteOperations().map((operation) => ({
    operationName: operation.operationName || "",
    workCenterId: operation.workCenterId || "",
    resourceId: operation.resourceId || "",
    calculationType: operation.calculationType || "",
    stepOrder: Number(operation.stepOrder || 0),
    secondsPerPanel: Number(operation.secondsPerPanel || 0),
    setupMin: Number(operation.setupMin || 0),
    bomListId: operation.bomListId || "",
    quantityMultiplier: Number(operation.quantityMultiplier || 1),
    boardsPerPanel: normalizeBoardsPerPanel(operation.boardsPerPanel, calculatorState.boardsPerPanel || 1),
    unitsPerHour: Number(operation.unitsPerHour || 0),
    counts: Object.entries(calculatorState.componentCountsByOperation?.[operation.id] || {})
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  })));
}

function isCalculatorRouteDirty() {
  return !calculatorState.routeSavedSignature || calculatorState.routeSavedSignature !== getCalculatorRouteSignature();
}

function getCalculatorWorkflow(calc) {
  const inputStatus = getCalculatorInputStatus(calc);
  const bomRows = calc.rows || [];
  const resultReady = inputStatus.complete && calc.totalMs > 0;
  const savedReady = Boolean(calculatorState.inputsSavedAt) && resultReady;
  const steps = [
    {
      id: "inputs",
      sequence: "01",
      title: "Входные данные",
      caption: "BOM, SMT-линия и размер запуска",
      complete: inputStatus.complete,
      locked: false,
    },
    {
      id: "bom",
      sequence: "02",
      title: "Компоненты",
      caption: inputStatus.bom ? "компоненты подтянуты из BOM" : "выберите BOM-лист",
      complete: inputStatus.complete && bomRows.some((row) => row.count > 0),
      locked: !inputStatus.complete,
    },
    {
      id: "summary",
      sequence: "03",
      title: "Результат",
      caption: resultReady ? "длительность SMT-операции рассчитана" : "появится после вводных",
      complete: resultReady,
      locked: !inputStatus.complete,
    },
    {
      id: "save",
      sequence: "04",
      title: "Сохранение",
      caption: savedReady ? `сохранено ${formatDateTime(calculatorState.inputsSavedAt)}` : "зафиксируйте входные данные",
      complete: savedReady,
      locked: !resultReady,
      warning: resultReady && !savedReady,
    },
  ];

  if (!steps.some((step) => step.id === ui.calculatorStep)) {
    ui.calculatorStep = steps.find((step) => !step.complete && !step.locked)?.id || "inputs";
  }
  return steps;
}

function getActiveCalculatorStep(calc) {
  const steps = getCalculatorWorkflow(calc);
  const active = steps.find((step) => step.id === ui.calculatorStep);
  if (active) return active.id;
  const next = steps.find((step) => !step.complete && !step.locked) || steps[0];
  ui.calculatorStep = next?.id || "inputs";
  return ui.calculatorStep;
}

function getCalculatorStepBlocks(stepId) {
  const groups = {
    inputs: ["inputs"],
    bom: ["specBom", "bom"],
    summary: ["summary"],
    route: ["route"],
    operation: ["operation"],
    save: ["save"],
    bindings: ["bindings"],
  };
  return groups[stepId] || groups.inputs;
}

function isCalculatorBlockVisible(stepId, blockId) {
  return getCalculatorStepBlocks(stepId).includes(blockId);
}

function renderCalculatorProcessStepper(calc) {
  return "";
}

function calculateComplexityResult() {
  const bomList = getBomList(calculatorState.bomListId);
  const boardQuantity = Number(calculatorState.boardQuantity || 0);
  const boardsPerPanel = Number(calculatorState.boardsPerPanel || 0);
  const smtLine = getSelectedSmtLineConfiguration();
  const hasInputSet = Boolean(bomList && smtLine && boardQuantity > 0 && boardsPerPanel > 0);
  const panelCount = hasInputSet ? Math.ceil(boardQuantity / boardsPerPanel) : 0;
  const smtResult = hasInputSet
    ? calculateSmtBomOperation(bomList, smtLine, { boardQuantity, boardsPerPanel, panelCount })
    : createEmptyOperationResult();
  const operationResults = hasInputSet ? [smtResult] : [];
  const selectedOperation = operationResults[0] || null;
  const selectedResult = selectedOperation || createEmptyOperationResult();
  const totalPerPanelSeconds = operationResults.reduce((sum, operation) => sum + operation.perPanelSeconds, 0);
  const totalSetupMs = operationResults.reduce((sum, operation) => sum + operation.setupMs, 0);
  const totalMs = operationResults.reduce((sum, operation) => sum + operation.totalMs, 0);
  const bottleneck = [...operationResults].sort((left, right) => right.perPanelSeconds - left.perPanelSeconds)[0];

  return {
    project: null,
    specification: null,
    bomList,
    bomEntries: bomList ? [{ bom: bomList, quantity: 1, boardsPerPanel, slot: "SMT" }] : [],
    smtLine,
    boardQuantity,
    boardsPerPanel,
    panelCount,
    operationResults,
    selectedOperation,
    selectedResult,
    totalPerPanelSeconds,
    totalSetupMs,
    totalMs,
    bottleneck,
    workCenter: selectedResult.workCenter,
    resources: getResourcesForWorkCenter(selectedResult.workCenterId),
    resource: selectedResult.resource,
    rows: selectedResult.componentRows,
    perBoardSeconds: selectedResult.perBoardSeconds,
    perPanelSeconds: selectedResult.perPanelSeconds,
    setupMs: selectedResult.setupMs,
    flowBoardsPerHour: selectedResult.flowBoardsPerHour,
    activeComponentCount: selectedResult.activeComponentCount,
  };
}

function calculateSmtBomOperation(bomList, smtLine, context) {
  const setupMs = Math.max(0, Number(smtLine?.changeoverMin || 0) * 60 * 1000);
  const resourceBaseCph = getResourceBaseCph(smtLine);
  const efficiency = Math.max(0.1, Number(calculatorState.efficiency || smtLine?.efficiency || 100) / 100);
  const counts = getBomComponentCounts(bomList);
  const componentRows = getComponentTypes().map((type) => {
    const count = Math.max(0, Math.round(Number(counts[type.id] ?? 0)));
    const coefficient = Math.max(0.1, Number(type.coefficient || 1));
    const typeLimitCph = Math.max(1, Number(type.placementsPerHour || resourceBaseCph / coefficient));
    const effectiveCph = Math.max(1, Math.min(typeLimitCph, resourceBaseCph / coefficient) * efficiency);
    const secondsPerBoard = count > 0 ? count / effectiveCph * 3600 : 0;
    return {
      type,
      count,
      coefficient,
      effectiveCph,
      secondsPerBoard,
      secondsPerPanel: secondsPerBoard * context.boardsPerPanel,
      totalPlacements: count * context.boardQuantity,
      complexity: count * coefficient,
    };
  });
  const perBoardSeconds = componentRows.reduce((sum, row) => sum + row.secondsPerBoard, 0);
  const perPanelSeconds = perBoardSeconds * context.boardsPerPanel;
  const totalMs = perPanelSeconds * context.panelCount * 1000 + setupMs;
  return {
    id: "smt-operation",
    operationName: "SMT-монтаж",
    workCenterId: "smt",
    calculationType: "components",
    resource: smtLine,
    resourceId: smtLine?.id || "",
    bomList,
    bomListId: bomList?.id || "",
    boardsPerPanel: context.boardsPerPanel,
    bomEntryQuantity: 1,
    operationBoardQuantity: context.boardQuantity,
    operationPanelCount: context.panelCount,
    componentRows,
    perBoardSeconds,
    perPanelSeconds,
    setupMs,
    totalMs,
    flowBoardsPerHour: perBoardSeconds > 0 ? 3600 / perBoardSeconds : 0,
    flowPanelsPerHour: perPanelSeconds > 0 ? 3600 / perPanelSeconds : 0,
    activeComponentCount: componentRows.filter((row) => row.count > 0).length,
    complexityScore: componentRows.reduce((sum, row) => sum + row.complexity, 0),
  };
}

function createEmptyOperationResult() {
  return {
    id: "",
    operationName: "",
    workCenterId: "",
    calculationType: "manual",
    componentRows: [],
    perBoardSeconds: 0,
    perPanelSeconds: 0,
    setupMs: 0,
    totalMs: 0,
    flowBoardsPerHour: 0,
    activeComponentCount: 0,
  };
}

function buildBomPreviewRows(calc) {
  if (!calc.bomList || !calc.boardQuantity || !calc.boardsPerPanel) return [];
  const counts = getBomComponentCounts(calc.bomList);
  const resource = calc.smtLine || getSelectedSmtLineConfiguration();
  const resourceBaseCph = getResourceBaseCph(resource);
  const efficiency = Math.max(0.1, Number(calculatorState.efficiency || resource?.efficiency || 100) / 100);
  return getComponentTypes().map((type) => {
    const count = Math.max(0, Math.round(Number(counts[type.id] ?? 0)));
    const coefficient = Math.max(0.1, Number(type.coefficient || 1));
    const typeLimitCph = Math.max(1, Number(type.placementsPerHour || resourceBaseCph / coefficient));
    const effectiveCph = Math.max(1, Math.min(typeLimitCph, resourceBaseCph / coefficient) * efficiency);
    const secondsPerBoard = count > 0 ? count / effectiveCph * 3600 : 0;
    return {
      type,
      count,
      coefficient,
      effectiveCph,
      secondsPerBoard,
      secondsPerPanel: secondsPerBoard * calc.boardsPerPanel,
      totalPlacements: count * calc.boardQuantity,
      complexity: count * coefficient,
    };
  });
}

function calculateRouteOperation(operation, context) {
  const workCenter = planningState.workCenters.find((center) => center.id === operation.workCenterId);
  const resources = getResourcesForWorkCenter(operation.workCenterId);
  const resource = resources.find((item) => item.id === operation.resourceId) || resources[0] || null;
  const setupMs = Math.max(0, Number(operation.setupMin || resource?.changeoverMin || 0) * 60 * 1000);
  const quantityMultiplier = Math.max(1, Number(operation.quantityMultiplier || 1));
  const calculationType = getDefaultOperationCalculationType(operation.workCenterId, operation);
  const operationBoardsPerPanel = normalizeBoardsPerPanel(operation.boardsPerPanel, context.boardsPerPanel || 1);
  const operationBoardQuantity = calculationType === "components"
    ? context.boardQuantity * quantityMultiplier
    : context.boardQuantity;
  const operationPanelCount = calculationType === "components"
    ? Math.max(1, Math.ceil(operationBoardQuantity / operationBoardsPerPanel))
    : context.panelCount;
  const operationBomList = getBomList(operation.bomListId);

  if (calculationType === "components") {
    const resourceBaseCph = getResourceBaseCph(resource);
    const efficiency = Math.max(0.1, Number(resource?.efficiency || 100) / 100);
    const counts = getOperationComponentCounts(operation);
    const componentRows = getComponentTypes().map((type) => {
      const count = Math.max(0, Math.round(Number(counts[type.id] ?? type.defaultCount ?? 0)));
      const coefficient = Math.max(0.1, Number(type.coefficient || 1));
      const typeLimitCph = Math.max(1, Number(type.placementsPerHour || resourceBaseCph / coefficient));
      const effectiveCph = Math.max(1, Math.min(typeLimitCph, resourceBaseCph / coefficient) * efficiency);
      const secondsPerBoard = count > 0 ? count / effectiveCph * 3600 : 0;
      return {
        type,
        count,
        coefficient,
        effectiveCph,
        secondsPerBoard,
        secondsPerPanel: secondsPerBoard * operationBoardsPerPanel,
        totalPlacements: count * operationBoardQuantity,
        complexity: count * coefficient,
      };
    });
    const perBoardSeconds = componentRows.reduce((sum, row) => sum + row.secondsPerBoard, 0);
    const perPanelSeconds = perBoardSeconds * operationBoardsPerPanel;
    const totalMs = perPanelSeconds * operationPanelCount * 1000 + setupMs;
	    return {
	      ...operation,
	      calculationType,
	      workCenter,
      resource,
      bomList: operationBomList,
      boardsPerPanel: operationBoardsPerPanel,
      bomEntryQuantity: quantityMultiplier,
      operationBoardQuantity,
      operationPanelCount,
      componentRows,
      perBoardSeconds,
      perPanelSeconds,
      setupMs,
      totalMs,
      flowBoardsPerHour: perBoardSeconds > 0 ? 3600 / perBoardSeconds : 0,
      flowPanelsPerHour: perPanelSeconds > 0 ? 3600 / perPanelSeconds : 0,
      activeComponentCount: componentRows.filter((row) => row.count > 0).length,
      complexityScore: componentRows.reduce((sum, row) => sum + row.complexity, 0),
    };
  }

  const fallbackSeconds = getDefaultSecondsPerPanel(operation.workCenterId, operationBoardsPerPanel);
  const perPanelSeconds = Math.max(0, Number(operation.secondsPerPanel || fallbackSeconds));
  const employeeCount = calculationType === "manual" ? getWorkCenterEmployeeCount(operation.workCenterId, planningState) : 1;
  const operationUnitCount = calculationType === "manual" ? operationBoardQuantity : operationPanelCount;
  const perBoardSeconds = calculationType === "manual"
    ? perPanelSeconds / employeeCount
    : perPanelSeconds / operationBoardsPerPanel;
  const totalMs = perPanelSeconds * operationUnitCount * 1000 / Math.max(1, employeeCount) + setupMs;
  return {
    ...operation,
    calculationType,
    workCenter,
    resource,
    bomList: operationBomList,
    boardsPerPanel: operationBoardsPerPanel,
    bomEntryQuantity: quantityMultiplier,
    operationBoardQuantity,
    operationPanelCount,
    componentRows: [],
    perBoardSeconds,
    perPanelSeconds,
    setupMs,
    totalMs,
    employeeCount,
    flowBoardsPerHour: perBoardSeconds > 0 ? 3600 / perBoardSeconds : 0,
    flowPanelsPerHour: perPanelSeconds > 0 ? 3600 / perPanelSeconds : 0,
    activeComponentCount: 0,
    complexityScore: 0,
  };
}

function getCalculatorProject() {
  return getProject(calculatorState.projectId || calculatorState.specificationId);
}

function getCalculatorWorkCenter() {
  const selectedOperation = getRouteOperations().find((operation) => operation.id === calculatorState.selectedOperationId);
  const planningCenters = getPlanningWorkCenters();
  return planningCenters.find((center) => center.id === selectedOperation?.workCenterId)
    || planningCenters.find((center) => center.id === "smt")
    || planningCenters[0];
}

function getRouteOperations() {
  const operations = Array.isArray(calculatorState.routeOperations) && calculatorState.routeOperations.length
    ? calculatorState.routeOperations
    : [];
  return operations
    .map((operation, index) => normalizeRouteOperation(operation, index + 1, calculatorState.boardsPerPanel))
    .sort((left, right) => left.stepOrder - right.stepOrder);
}

function normalizeRouteOperation(operation, stepOrder, boardsPerPanel = 1) {
  const workCenterId = operation.workCenterId || "smt";
  const resources = getResourcesForWorkCenter(workCenterId);
  const resource = resources.find((item) => item.id === operation.resourceId) || resources[0];
  const calculationType = getDefaultOperationCalculationType(workCenterId, operation);
  const normalizedBoardsPerPanel = normalizeBoardsPerPanel(operation.boardsPerPanel, boardsPerPanel || 1);
  return {
    id: operation.id || makeId("op"),
    stepOrder: Math.max(1, Number(operation.stepOrder || stepOrder)),
    operationName: operation.operationName || getWorkCenter(workCenterId)?.name || "Операция",
    workCenterId,
    resourceId: resource?.id || operation.resourceId || "",
    calculationType,
    secondsPerPanel: Math.max(0, Number(operation.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, boardsPerPanel))),
    boardsPerPanel: normalizedBoardsPerPanel,
    setupMin: Math.max(0, Number(operation.setupMin || resource?.changeoverMin || 0)),
    comment: operation.comment || "",
    bomListId: operation.bomListId || "",
    bomSlot: operation.bomSlot || "",
    quantityMultiplier: Math.max(1, Number(operation.quantityMultiplier || 1)),
    sourceRouteStepId: operation.sourceRouteStepId || "",
  };
}

function createDefaultRouteOperations(projectId, boardsPerPanel = defaultCalculatorState.boardsPerPanel) {
  const route = getProjectRouteForModule(projectId || calculatorState.specificationId);
  const steps = route ? getRouteStepsForModule(route.id) : [];
  const specification = (directoryState.specifications || []).find((item) => item.id === calculatorState.specificationId)
    || getProjectSpecification(projectId);
  const selectedBom = getBomList(calculatorState.bomListId);
  const bomEntries = calculatorState.noSpecification && selectedBom
    ? [{ bom: selectedBom, quantity: 1, boardsPerPanel, slot: "PCB" }]
    : getSpecificationBomEntries(specification?.id);
  const source = steps.length ? steps : [
    { workCenterId: "smt", operationName: "SMT-монтаж", stepOrder: 1 },
    { workCenterId: "aoi", operationName: "AOI-контроль", stepOrder: 2 },
    { workCenterId: "wash", operationName: "Отмывка", stepOrder: 3 },
    { workCenterId: "manual", operationName: "Ручной монтаж", stepOrder: 4 },
    { workCenterId: "test", operationName: "Тестирование", stepOrder: 5 },
    { workCenterId: "assembly", operationName: "Сборка", stepOrder: 6 },
    { workCenterId: "warehouse", operationName: "Склад", stepOrder: 7 },
  ];

  const operations = [];
  source.forEach((step) => {
    const resource = getResourcesForWorkCenter(step.workCenterId)[0];
    const isExpandableSmt = step.workCenterId === "smt" && bomEntries.length > 0 && !step.bomListId;
    const entries = isExpandableSmt ? bomEntries : [{ bom: getBomList(step.bomListId), quantity: step.quantityMultiplier || 1, boardsPerPanel: step.boardsPerPanel || boardsPerPanel || 1, slot: step.bomSlot || "" }];

    entries.forEach((entry) => {
      const entryLabel = entry.bom?.resultItem || entry.bom?.name || "";
      const operationName = isExpandableSmt && entryLabel
        ? `SMT-монтаж · ${entryLabel}`
        : step.operationName || getWorkCenter(step.workCenterId)?.name || "Операция";

      operations.push(normalizeRouteOperation({
        id: step.bomListId ? `op-${step.workCenterId}-${step.id || operations.length + 1}` : makeRouteOperationId(step, entry, operations.length + 1),
        stepOrder: Number(step.stepOrder || operations.length + 1),
        operationName,
        workCenterId: step.workCenterId,
        resourceId: resource?.id || "",
        calculationType: getDefaultOperationCalculationType(step.workCenterId, step),
        secondsPerPanel: getDefaultSecondsPerPanel(step.workCenterId, boardsPerPanel),
        boardsPerPanel: entry.boardsPerPanel || step.boardsPerPanel || boardsPerPanel || 1,
        setupMin: Number(resource?.changeoverMin || 0),
        comment: step.isRequired === false ? "опциональная операция" : "",
        bomListId: entry.bom?.id || step.bomListId || "",
        bomSlot: entry.slot || step.bomSlot || "",
        quantityMultiplier: entry.quantity || step.quantityMultiplier || 1,
        sourceRouteStepId: step.id || "",
      }, operations.length + 1));
    });
  });

  return operations.map((operation, index) => normalizeRouteOperation({
    ...operation,
    stepOrder: index + 1,
  }, index + 1, boardsPerPanel));
}

function makeRouteOperationId(step, entry, index) {
  if (step.id && entry?.bom?.id) return `op-${step.id}-${entry.bom.id}-${entry.slot || index}`;
  if (entry?.bom?.id) return `op-${step.workCenterId}-${entry.bom.id}-${entry.slot || index}`;
  return `op-${step.workCenterId}-${index}`;
}

function getDefaultSecondsPerPanel(workCenterId, boardsPerPanel = 1) {
  const defaults = {
    aoi: 40,
    wash: 180,
    manual: 900,
    test: 300,
    coating: 240,
    mechanic: 360,
    assembly: 420,
    warehouse: 60,
  };
  if (workCenterId === "smt") return 0;
  if (defaults[workCenterId]) return defaults[workCenterId];
  const rate = Math.max(1, getWorkCenterUnitsPerHour(workCenterId));
  return Math.max(30, Math.round((Math.max(1, Number(boardsPerPanel || 1)) / rate) * 3600));
}

function getOperationComponentCounts(operationOrId) {
  const operation = operationOrId && typeof operationOrId === "object" ? operationOrId : null;
  const operationId = operation?.id || operationOrId;
  const operationBom = getBomList(operation?.bomListId) || getBomList(calculatorState.bomListId);
  const byOperation = calculatorState.componentCountsByOperation || {};
  return {
    ...(operationBom ? getBomComponentCounts(operationBom) : getDefaultComponentCounts()),
    ...(byOperation[operationId] || {}),
  };
}

function getComponentTypes() {
  const source = directoryState?.componentTypes?.length ? directoryState.componentTypes : DEFAULT_COMPONENT_TYPES;
  return source.filter((type) => type.status !== "Отключен");
}

function getProjectSpecification(projectId) {
  if (!projectId) return null;
  return (directoryState.specifications || []).find((specification) => (
    specification.id === projectId || specification.projectId === projectId
  )) || null;
}

function normalizeSpecificationStructureItem(item, index = 0) {
  const allowedTypes = new Set(["assembly", "bom", "specification", "part", "nomenclature"]);
  const type = allowedTypes.has(item?.type) ? item.type : item?.bomListId ? "bom" : "part";
  const rawQuantity = Number(item?.quantity ?? item?.qty ?? 1);
  const quantity = Number.isFinite(rawQuantity) && rawQuantity >= 0 ? Math.round(rawQuantity) : 1;
  const rawExecutionType = String(item?.executionType || item?.fulfillmentType || "");
  const nomenclatureItem = type === "nomenclature" || type === "part"
    ? (directoryState?.nomenclature || []).find((entry) => entry.id === String(item?.nomenclatureId || item?.itemId || ""))
    : null;
  const executionType = nomenclatureItem?.sourceBomResultId
    ? "make"
    : ["make", "buy"].includes(rawExecutionType)
    ? rawExecutionType
    : type === "nomenclature" || type === "part"
      ? getDefaultNomenclatureExecutionType(nomenclatureItem)
      : "make";
  const defaultOperationName = type === "nomenclature" || type === "part"
    ? getDefaultSpekiOperationForNomenclature(nomenclatureItem, executionType)
    : getDefaultSpekiOperationName(type, executionType);
  const operationName = String(item?.operationName || item?.operation || item?.routeOperation || defaultOperationName);
  const bomListId = type === "bom" ? String(item?.bomListId || item?.bomId || "") : "";
  return {
    id: String(item?.id || makeId("spi")),
    parentId: String(item?.parentId || "root"),
    type,
    executionType,
    operationName,
    departmentName: String(item?.departmentName || item?.department || ""),
    bomListId,
    specificationId: type === "specification" ? String(item?.specificationId || item?.linkedSpecificationId || "") : "",
    nomenclatureId: type === "nomenclature" ? String(item?.nomenclatureId || item?.itemId || "") : "",
    name: String(item?.name || ""),
    quantity,
    unit: String(item?.unit || (type === "assembly" ? "узел" : type === "bom" ? "плата" : type === "specification" ? "спец." : "шт.")),
    boardsPerPanel: type === "bom" ? normalizeBoardsPerPanel(item?.boardsPerPanel ?? item?.boardsInPanel ?? item?.panelSize ?? 1, 1) : 1,
    resultItem: String(item?.resultItem || ""),
    note: String(item?.note || ""),
    position: Math.max(1, Math.round(Number(item?.position || index + 1))),
  };
}

function buildDefaultSpecificationStructureItems(specification) {
  if (!specification) return [];
  const rows = [];
  const pushBom = (bomListId, quantity, slot) => {
    const bom = getBomList(bomListId);
    if (!bom || Number(quantity || 0) <= 0) return;
    const resultNomenclature = getBomResultNomenclatureItem(bom.id);
    rows.push(normalizeSpecificationStructureItem({
      id: `${specification.id || "spec"}-bom-${String(slot).toLowerCase()}`,
      type: resultNomenclature ? "nomenclature" : "bom",
      parentId: "root",
      bomListId: resultNomenclature ? "" : bom.id,
      nomenclatureId: resultNomenclature?.id || "",
      executionType: "make",
      operationName: "SMT-монтаж",
      departmentName: getDefaultSpekiDepartmentName("SMT-монтаж"),
      name: resultNomenclature?.name || bom.name,
      quantity: Number(quantity || 1),
      unit: resultNomenclature?.unit || "шт.",
      boardsPerPanel: 1,
      resultItem: resultNomenclature?.name || bom.resultItem || bom.boardCode || "",
      note: resultNomenclature ? `Результат BOM ${slot}` : `BOM ${slot}`,
      position: rows.length + 1,
    }, rows.length));
  };

  pushBom(specification.bomListA, specification.bomQtyA, "A");
  pushBom(specification.bomListB, specification.bomQtyB, "B");

  String(specification.extraItems || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((name) => {
      rows.push(normalizeSpecificationStructureItem({
        id: `${specification.id || "spec"}-part-${rows.length + 1}`,
        type: "nomenclature",
        parentId: "root",
        name,
        quantity: 1,
        unit: "шт.",
        resultItem: name,
        note: "Дополнительный состав",
        position: rows.length + 1,
      }, rows.length));
    });

  return rows;
}

function getSpecificationStructureItems(specification) {
  if (!specification) return [];
  const hasManagedStructure = Boolean(specification.structureManaged);
  const sourceItems = hasManagedStructure
    ? specification.structureItems || []
    : Array.isArray(specification.structureItems) && specification.structureItems.length
      ? specification.structureItems
      : buildDefaultSpecificationStructureItems(specification);
  return sourceItems
    .map((item, index) => normalizeSpecificationStructureItem(item, index))
    .sort((left, right) => left.position - right.position);
}

function getSpecificationBomCandidates(specification, items = []) {
  const candidates = [];
  const seenIds = new Set();
  const addBom = (bom) => {
    if (!bom?.id || seenIds.has(bom.id)) return;
    seenIds.add(bom.id);
    candidates.push(bom);
  };

  [specification?.bomListA, specification?.bomListB]
    .map((bomId) => getBomList(bomId))
    .forEach(addBom);
  items
    .map((item) => getBomList(item.bomListId))
    .forEach(addBom);
  (directoryState.bomLists || []).forEach(addBom);

  return candidates;
}

function pickDefaultBomForSpecificationItem(specification, items = [], currentItemId = "") {
  const usedBomIds = new Set(items
    .filter((item) => item.id !== currentItemId && item.type === "bom" && item.bomListId)
    .map((item) => item.bomListId));
  const candidates = getSpecificationBomCandidates(specification, items);
  return candidates.find((bom) => !usedBomIds.has(bom.id)) || candidates[0] || null;
}

function getDefaultSpekiOperationName(type, executionType = "make") {
  if (executionType === "buy") return "";
  if (type === "bom") return "SMT-монтаж";
  if (type === "assembly" || type === "specification") return "Сборка";
  return "";
}

function getSpekiOperationOptions() {
  const options = new Map();
  const addOption = (value, label, meta) => {
    const key = String(value || "");
    if (options.has(key)) return;
    options.set(key, { value: key, label: label || key || "Операция не требуется", meta: meta || "" });
  };

  addOption("", "Операция не требуется", "для покупных изделий");
  (planningState.routeSteps || []).forEach((step) => {
    const operationName = String(step.operationName || "").trim();
    if (!operationName) return;
    const center = getWorkCenter(step.workCenterId);
    addOption(operationName, operationName, center?.name || "маршрутная операция");
  });
  getPlanningWorkCenters().forEach((center) => {
    if (!center?.name) return;
    addOption(center.name, center.name, center.code || "подразделение");
  });

  ["SMT-монтаж", "AOI-контроль", "Отмывка", "Ручной монтаж", "Тестирование", "Лакировка", "Слесарное подразделение", "Сборка", "Склад"]
    .forEach((name) => addOption(name, name, "типовая операция"));

  return [...options.values()];
}

function getSpekiDepartmentOptions() {
  return [
    { value: "", label: "Подразделение не выбрано", meta: "назначьте для операции" },
    ...getEmployeeDepartmentNames().map((name) => ({ value: name, label: name, meta: "справочник подразделений" })),
  ];
}

function getDefaultSpekiDepartmentName(operationName) {
  const normalizedOperation = String(operationName || "").toLowerCase();
  if (!normalizedOperation) return "";
  const names = getEmployeeDepartmentNames();
  const rules = [
    { tokens: ["smt"], preferred: ["SMT-монтаж", "SMT отдел", "STM отдел"] },
    { tokens: ["aoi", "аои"], preferred: ["AOI-контроль", "ОТК / AOI-контроль", "ОТК"] },
    { tokens: ["контроль", "тест", "испыт"], preferred: ["Тестирование", "ОТК / Испытания", "ОТК"] },
    { tokens: ["отмыв"], preferred: ["Отмывка"] },
    { tokens: ["ручн", "tht"], preferred: ["Ручной монтаж", "THT отдел"] },
    { tokens: ["лакир"], preferred: ["Лакировка", "Отдел селективной лакировки", "Отдел ручной лакировки"] },
    { tokens: ["слесар", "механ"], preferred: ["Слесарное подразделение", "Слесарный отдел"] },
    { tokens: ["сбор"], preferred: ["Сборка", "Сборочный отдел", "Слесарный отдел"] },
    { tokens: ["программ", "прошив"], preferred: ["Отдел программной подготовки изделий"] },
    { tokens: ["комплект"], preferred: ["Склад", "Склад компонентов"] },
    { tokens: ["закуп"], preferred: ["Закупки и снабжение"] },
    { tokens: ["склад", "упаков"], preferred: ["Склад", "Склад готовой продукции", "Склад компонентов"] },
  ];
  const rule = rules.find((item) => item.tokens.some((token) => normalizedOperation.includes(token)));
  if (!rule) return "";
  return rule.preferred
    .map((preferredName) => names.find((name) => name.toLowerCase() === preferredName.toLowerCase()))
    .find(Boolean)
    || names.find((name) => rule.preferred.some((preferredName) => name.toLowerCase().includes(preferredName.toLowerCase())))
    || "";
}

function getSpecificationStructureRows(specification) {
  if (!specification) return [];
  const rows = [{
    level: 0,
    position: "00",
    type: "Узел",
    name: specification.outputItem || specification.name || "Итоговое изделие",
    source: "Производственная спецификация",
    quantity: 1,
    unit: "изд.",
    result: specification.outputItem || specification.name || "",
    note: "Производственная спецификация",
  }];

  const items = getSpecificationStructureItems(specification);
  const visited = new Set();
  const makeRow = (item, index, level) => {
    const bom = item.type === "bom" ? getBomList(item.bomListId) : null;
    const linkedSpecification = item.type === "specification"
      ? (directoryState.specifications || []).find((specification) => specification.id === item.specificationId)
      : null;
    const nomenclatureItem = item.type === "nomenclature"
      ? (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)
      : null;
    return {
      level,
      position: String(index + 1).padStart(2, "0"),
      type: item.type === "bom" ? "Плата BOM" : item.type === "specification" ? "Спецификация" : item.type === "assembly" ? "Узел" : "Номенклатура",
      name: item.type === "bom"
        ? bom?.name || item.name || "BOM не выбран"
        : item.type === "specification"
          ? linkedSpecification?.name || item.name || "Спецификация не выбрана"
          : item.type === "nomenclature"
            ? nomenclatureItem?.name || item.name || "Позиция не выбрана"
            : item.name || "Позиция не задана",
      source: item.type === "bom" ? bom?.boardCode || "BOM" : item.type === "specification" ? "Вложенная спецификация" : item.type === "assembly" ? "Внутренний узел" : item.type === "nomenclature" ? nomenclatureItem?.article || "Номенклатура" : "Спецификация",
      quantity: item.quantity,
      unit: item.unit,
      boardsPerPanel: getSpecificationItemBoardsPerPanel(item),
      result: item.type === "bom"
        ? bom?.resultItem || item.resultItem || bom?.name || ""
        : item.type === "specification"
          ? linkedSpecification?.outputItem || item.resultItem || linkedSpecification?.name || ""
          : item.type === "nomenclature"
            ? nomenclatureItem?.name || item.resultItem || item.name || ""
            : item.resultItem || item.name || "",
      note: item.note || "",
    };
  };
  const appendChildren = (parentId, level) => {
    items
      .filter((item) => (item.parentId || "root") === parentId && !visited.has(item.id))
      .forEach((item) => {
        visited.add(item.id);
        rows.push(makeRow(item, rows.length, level));
        appendChildren(item.id, level + 1);
      });
  };

  appendChildren("root", 1);
  items
    .filter((item) => !visited.has(item.id))
    .forEach((item) => {
      visited.add(item.id);
      rows.push(makeRow(item, rows.length, 1));
    });

  return rows;
}

function getSpecificationBomResultNameKeys(specification) {
  const keys = new Set();
  [specification?.bomListA, specification?.bomListB]
    .map((bomId) => getBomList(bomId))
    .filter(Boolean)
    .forEach((bom) => {
      [
        bom.name,
        bom.resultItem,
        bom.boardCode,
        getBomResultNomenclatureItem(bom.id)?.name,
      ].filter(Boolean).forEach((name) => keys.add(normalizeLookupText(name)));
    });
  return keys;
}

function cleanSpecificationExtraItems(specification) {
  const blockedKeys = getSpecificationBomResultNameKeys(specification);
  const seenKeys = new Set();
  return String(specification?.extraItems || "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => {
      const key = normalizeLookupText(item);
      if (!key || seenKeys.has(key) || blockedKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .join("; ");
}

function syncSpecificationDerivedFields(specification) {
  const cleanedExtraItems = cleanSpecificationExtraItems(specification);
  const sourceSpecification = cleanedExtraItems === String(specification?.extraItems || "")
    ? specification
    : { ...specification, extraItems: cleanedExtraItems };
  const items = getSpecificationStructureItems(sourceSpecification);
  const bomItems = items
    .map((item) => ({ item, bomId: getSpecificationItemBomId(item) }))
    .filter((entry) => entry.bomId);
  const partItems = items.filter((item) => (
    (item.type === "part" || item.type === "nomenclature")
    && item.name
    && !getSpecificationItemBomId(item)
  ));
  const isManaged = Boolean(sourceSpecification.structureManaged || Array.isArray(sourceSpecification.structureItems));
  return {
    ...sourceSpecification,
    bomListA: bomItems[0]?.bomId || (isManaged ? "" : sourceSpecification.bomListA || ""),
    bomQtyA: bomItems[0] ? Number(bomItems[0].item.quantity || 0) : isManaged ? 0 : Number(sourceSpecification.bomQtyA || 0),
    bomListB: bomItems[1]?.bomId || "",
    bomQtyB: bomItems[1] ? Number(bomItems[1].item.quantity || 0) : 0,
    extraItems: isManaged
      ? sourceSpecification.extraItems || ""
      : partItems.map((item) => item.name).join("; ") || sourceSpecification.extraItems || "",
  };
}

function getSpecificationBomEntries(specificationId) {
  const specification = (directoryState.specifications || []).find((item) => item.id === specificationId);
  if (!specification) return [];
  return getSpecificationStructureItems(specification)
    .map((item) => ({ item, bomId: getSpecificationItemBomId(item) }))
    .filter(({ bomId, item }) => bomId && Number(item.quantity || 0) > 0)
    .map((item, index) => ({
      bom: getBomList(item.bomId),
      quantity: Math.max(0, Number(item.item.quantity || 0)),
      boardsPerPanel: getSpecificationItemBoardsPerPanel(item.item),
      slot: item.item.note || String(index + 1),
      structureItemId: item.item.id,
    }))
    .filter((entry) => entry.bom && entry.quantity > 0);
}

function getCalculatorBomSource(project, specification, noSpecification = false) {
  if (specification && !noSpecification) {
    return getSpecificationBomEntries(specification.id).map((entry) => entry.bom);
  }

  if (!project) return [];
  const direct = (directoryState.bomLists || []).filter((bom) => bom.projectId === project.id);
  if (direct.length) return direct;
  if (noSpecification) return [];

  const projectSpecification = getProjectSpecification(project.id);
  return getSpecificationBomEntries(projectSpecification?.id).map((entry) => entry.bom);
}

function buildSpecificationSummary(specification) {
  if (!specification) return "Выберите спецификацию к производству.";
  const bomText = getSpecificationBomEntries(specification.id)
    .map((entry) => `${entry.quantity}x ${entry.bom.resultItem || entry.bom.name}`)
    .join(" + ");
  const extras = specification.extraItems ? ` + ${specification.extraItems}` : "";
  return `${bomText || "BOM не выбран"}${extras}`;
}

function buildNoSpecificationSummary(calc) {
  if (!calc.specification) return "Выберите спецификацию, затем BOM печатной платы.";
  if (!calc.bomList) return "Для спецификации без структуры BOM можно использовать маршрут ручных работ.";
  return `${calc.specification.name}: результат SMT считается как ${calc.bomList.resultItem || calc.bomList.name}.`;
}

function getBomList(bomId) {
  return (directoryState.bomLists || []).find((bom) => bom.id === bomId) || null;
}

function getBomResultNomenclatureItem(bomId) {
  const bom = getBomList(bomId);
  if (!bom) return null;

  const items = directoryState.nomenclature || [];
  const direct = items.find((item) => String(item.sourceBomResultId || "") === String(bom.id));
  if (direct) return direct;

  const payload = makeBomResultNomenclaturePayload(bom);
  if (!payload) return null;
  const index = findBomResultNomenclatureIndex(items, bom, payload);
  return index >= 0 ? items[index] : null;
}

function getNomenclatureSourceBomId(nomenclatureId) {
  const item = (directoryState.nomenclature || []).find((entry) => entry.id === nomenclatureId);
  if (!item) return "";
  if (item.sourceBomResultId) return String(item.sourceBomResultId);
  if (normalizeNomenclatureType(item.type) !== "Печатные платы") return "";
  const sourceIds = Array.isArray(item.sourceBomIds) ? item.sourceBomIds : [];
  return String(sourceIds[0] || "");
}

function getSpecificationItemBomId(item) {
  if (!item) return "";
  if (item.type === "bom") return String(item.bomListId || "");
  if (item.type === "nomenclature") return getNomenclatureSourceBomId(item.nomenclatureId);
  return "";
}

function getSpecificationItemBom(item) {
  return getBomList(getSpecificationItemBomId(item));
}

function getBomComponentCounts(bom) {
  if (!bom) return getDefaultComponentCounts();
  const importRows = Array.isArray(bom.importRows) ? bom.importRows.map((row) => normalizeBomImportRow(row)) : [];
  if (importRows.length) {
    const totals = summarizeBomComponentFields(importRows);
    return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
      field.componentId,
      Math.max(0, Math.round(Number(totals[field.key] || 0))),
    ]));
  }
  return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
    field.componentId,
    Math.max(0, Math.round(Number(bom[field.key] || 0))),
  ]));
}

function getBomComponentFieldCounts(componentCounts = {}) {
  return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
    field.key,
    Math.max(0, Math.round(Number(componentCounts[field.key] ?? componentCounts[field.componentId] ?? 0))),
  ]));
}

function normalizeBomImportRow(row) {
  const source = Array.isArray(row?.values) ? row.values : Array.isArray(row) ? row : [];
  const values = Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, index) => source[index] ?? row?.[index] ?? "");
  const packageValue = normalizeBomPackageValue(values[5]);
  const quantity = normalizeBomQuantityValue(values[6]);
  const normalizedValues = [...values];
  normalizedValues[5] = packageValue;
  normalizedValues[6] = quantity;
  return {
    sequence: values[0] ?? "",
    description: values[1] ?? "",
    designator: values[2] ?? "",
    manufacturerPart: values[3] ?? "",
    manufacturer: values[4] ?? "",
    package: packageValue,
    quantity,
    note: values[7] ?? "",
    extra: values[8] ?? "",
    nomenclatureId: row?.nomenclatureId || "",
    values: normalizedValues,
  };
}

function getBomImportRows(bom) {
  return Array.isArray(bom?.importRows) ? bom.importRows.map((row) => normalizeBomImportRow(row)) : [];
}

function getBomImportHeaders(bom) {
  const headers = Array.isArray(bom?.importHeaders) ? bom.importHeaders : [];
  return Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, index) => {
    const value = String(headers[index] || "").trim();
    return value || BOM_IMPORT_FALLBACK_HEADERS[index] || `Поле ${index + 1}`;
  });
}

function getFileBaseName(fileName) {
  return String(fileName || "BOM")
    .replace(/\.[^.]+$/, "")
    .trim() || "BOM";
}

function classifyBomPackage(row) {
  const packageText = normalizePackageText(row.package || "");
  const combined = normalizePackageText(`${row.package || ""} ${row.description || ""}`);

  if (packageText === "0402") return "c0402";
  if (packageText === "0603") return "c0603";
  if (packageText === "0805") return "c0805";
  if (combined.includes("0402")) return "c0402";
  if (combined.includes("0603")) return "c0603";
  if (combined.includes("0805")) return "c0805";
  if (combined.includes("sot23") || combined.includes("sot-23") || combined.includes("sod")) return "csot23";
  if (combined.includes("soic") || combined.includes("tssop") || combined.includes("ssop")) return "csoic";
  if (combined.includes("qfn") || combined.includes("dfn") || combined.includes("lga")) return "cqfn";
  if (combined.includes("bga")) return "cbga";
  if (combined.includes("connector") || combined.includes("разъем") || combined.includes("разъём") || combined.includes("terminal")) return "cconnector";
  return "cconnector";
}

function normalizeBomPackageValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const leadingZeroPackages = {
    201: "0201",
    402: "0402",
    603: "0603",
    805: "0805",
  };
  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric) && Number.isInteger(numeric)) {
    const normalizedNumericPackage = leadingZeroPackages[String(numeric)];
    if (normalizedNumericPackage) return normalizedNumericPackage;
  }

  const compact = raw.replace(/[.,]/g, "").replace(/\s+/g, "");
  return leadingZeroPackages[compact] || raw;
}

function normalizeBomQuantityValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const compact = raw.replace(/\s+/g, "");
  const normalizedDecimal = compact.replace(",", ".");
  const decimalNumber = Number(normalizedDecimal);
  if (Number.isFinite(decimalNumber)) return Math.max(0, Math.round(decimalNumber));
  const digitNumber = Number(compact.replace(/[^\d.-]/g, ""));
  return Number.isFinite(digitNumber) ? Math.max(0, Math.round(digitNumber)) : 0;
}

function normalizePackageText(value) {
  return normalizeBomPackageValue(value)
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, "");
}

function summarizeBomComponentFields(importRows) {
  const totals = Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, 0]));
  for (const row of importRows) {
    const key = classifyBomPackage(row);
    totals[key] = (totals[key] || 0) + Math.max(0, Number(row.quantity || 0));
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value)]));
}

function makeBomImportNomenclaturePayload(row, bom, stamp) {
  const normalizedRow = normalizeBomImportRow(row);
  const name = String(normalizedRow.description || normalizedRow.manufacturerPart || normalizedRow.designator || `Компонент ${normalizedRow.sequence || ""}`).trim();
  const article = String(normalizedRow.manufacturerPart || "").trim();
  if (!name && !article) return null;

  const descriptionParts = [
    normalizedRow.designator ? `Обозначение: ${normalizedRow.designator}` : "",
    normalizedRow.note ? `Примечание: ${normalizedRow.note}` : "",
    bom?.name ? `Источник BOM: ${bom.name}` : "",
  ].filter(Boolean);

  return normalizeDirectoryRow("nomenclature", {
    id: makeId("nom"),
    name,
    article,
    type: NOMENCLATURE_REA_COMPONENT_TYPE,
    package: normalizedRow.package,
    unit: "шт.",
    manufacturer: normalizedRow.manufacturer,
    description: descriptionParts.join(". "),
    status: "Активен",
    sourceBomIds: bom?.id ? [bom.id] : [],
    lastBomImportAt: stamp,
    updatedAt: stamp,
  });
}

function makeBomResultNomenclaturePayload(bom, stamp = new Date().toISOString()) {
  const name = String(bom?.resultItem || bom?.boardCode || bom?.name || "").trim();
  if (!name) return null;

  const descriptionParts = [
    bom?.name ? `Результат BOM: ${bom.name}` : "",
    bom?.boardCode ? `Код платы: ${bom.boardCode}` : "",
    "Тип позиции: печатная плата",
  ].filter(Boolean);

  return normalizeDirectoryRow("nomenclature", {
    id: makeId("nom"),
    name,
    article: String(bom?.boardCode || "").trim(),
    type: "Печатные платы",
    package: "PCB",
    unit: "шт.",
    manufacturer: "",
    description: descriptionParts.join(". "),
    status: "Активен",
    sourceBomResultId: bom?.id || "",
    sourceBomIds: bom?.id ? [bom.id] : [],
    lastBomResultSyncAt: stamp,
    updatedAt: stamp,
  });
}

function findImportedNomenclatureIndex(items, payload) {
  const article = normalizeLookupText(payload.article);
  const name = normalizeLookupText(payload.name);
  const packageValue = normalizePackageText(payload.package);
  const manufacturer = normalizeLookupText(payload.manufacturer);

  if (article) {
    const articleIndex = items.findIndex((item) => normalizeLookupText(item.article) === article);
    if (articleIndex >= 0) return articleIndex;
  }

  return items.findIndex((item) => (
    name
    && normalizeLookupText(item.name) === name
    && normalizePackageText(item.package) === packageValue
    && normalizeLookupText(item.manufacturer) === manufacturer
  ));
}

function findBomResultNomenclatureIndex(items, bom, payload) {
  const bomId = String(bom?.id || "");
  const article = normalizeLookupText(payload?.article);
  const name = normalizeLookupText(payload?.name);

  if (bomId) {
    const directIndex = items.findIndex((item) => String(item.sourceBomResultId || "") === bomId);
    if (directIndex >= 0) return directIndex;
  }

  if (article) {
    const articleIndex = items.findIndex((item) => (
      normalizeNomenclatureType(item.type) === "Печатные платы"
      && normalizeLookupText(item.article) === article
    ));
    if (articleIndex >= 0) return articleIndex;
  }

  if (name) {
    return items.findIndex((item) => (
      normalizeNomenclatureType(item.type) === "Печатные платы"
      && normalizeLookupText(item.name) === name
    ));
  }

  return -1;
}

function mergeBomSourceIds(existing, incoming) {
  return [...new Set([
    ...(Array.isArray(existing?.sourceBomIds) ? existing.sourceBomIds : []),
    ...(Array.isArray(incoming?.sourceBomIds) ? incoming.sourceBomIds : []),
  ].filter(Boolean))];
}

function isReaNomenclatureItem(item) {
  return normalizeLookupText(item?.type) === normalizeLookupText(NOMENCLATURE_REA_COMPONENT_TYPE);
}

function normalizeNomenclatureType(value) {
  const text = String(value || "").trim();
  const normalized = normalizeLookupText(text);
  if (!normalized || ["компонент", "компоненты", "рэа", "rea", "радиоэлектронные компоненты"].includes(normalized)) {
    return NOMENCLATURE_REA_COMPONENT_TYPE;
  }
  return text;
}

function getNomenclatureTypeRows(options = {}) {
  const rows = Array.isArray(directoryState?.nomenclatureTypes) ? directoryState.nomenclatureTypes : [];
  const seen = new Set();
  return rows
    .map((row) => normalizeDirectoryRow("nomenclatureTypes", row))
    .filter((row) => row.name)
    .filter((row) => options.includeInactive || !["отключен", "удален", "архив"].includes(normalizeLookupText(row.status)))
    .filter((row) => {
      const key = normalizeLookupText(row.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function makeNomenclatureTypeRow(typeName, meta = "Добавлено из модуля номенклатуры") {
  const name = normalizeNomenclatureType(typeName);
  const defaultRow = DEFAULT_NOMENCLATURE_TYPES.find((item) => normalizeLookupText(item.name) === normalizeLookupText(name));
  return normalizeDirectoryRow("nomenclatureTypes", {
    id: defaultRow?.id || makeId("nom-type"),
    name,
    code: defaultRow?.code || "",
    description: defaultRow?.description || meta,
    status: defaultRow?.status || "Активен",
  });
}

function ensureNomenclatureTypeExists(typeName, options = {}) {
  const name = normalizeNomenclatureType(typeName);
  if (!name) return "";
  const exists = getNomenclatureTypeRows({ includeInactive: true })
    .some((row) => normalizeLookupText(row.name) === normalizeLookupText(name));
  if (exists) return name;

  directoryState.nomenclatureTypes = [
    ...(directoryState.nomenclatureTypes || []),
    makeNomenclatureTypeRow(name, options.meta),
  ];
  return name;
}

function syncNomenclatureTypesFromItems(options = {}) {
  const existingKeys = new Set(getNomenclatureTypeRows({ includeInactive: true }).map((row) => normalizeLookupText(row.name)));
  const itemTypes = [...new Set((directoryState.nomenclature || [])
    .map((item) => normalizeNomenclatureType(item.type))
    .filter(Boolean))]
    .filter((type) => !existingKeys.has(normalizeLookupText(type)));

  if (!itemTypes.length) return false;
  directoryState.nomenclatureTypes = [
    ...(directoryState.nomenclatureTypes || []),
    ...itemTypes.map((type) => makeNomenclatureTypeRow(type, "Добавлено из существующей номенклатуры")),
  ];
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  if (options.persist) persistDirectoryState();
  return true;
}

function syncNomenclatureTypeRename(previousName, nextName) {
  const previous = normalizeNomenclatureType(previousName);
  const next = normalizeNomenclatureType(nextName);
  if (!previous || !next || normalizeLookupText(previous) === normalizeLookupText(next)) return;
  directoryState.nomenclature = (directoryState.nomenclature || []).map((item) => (
    normalizeLookupText(item.type) === normalizeLookupText(previous)
      ? { ...item, type: next, updatedAt: new Date().toISOString() }
      : item
  ));
  if (normalizeLookupText(ui.nomenclatureTypeFilter) === normalizeLookupText(previous)) {
    ui.nomenclatureTypeFilter = next;
  }
}

function getFallbackNomenclatureType(excludedName = "") {
  const excluded = normalizeLookupText(excludedName);
  return getNomenclatureTypeRows()
    .map((row) => row.name)
    .find((name) => normalizeLookupText(name) !== excluded) || "";
}

function getNomenclatureTypeOptions(items = directoryState.nomenclature || []) {
  return getNomenclatureTypeRows().map((type) => ({
    value: type.name,
    label: type.name,
    meta: type.description || type.code || "тип номенклатуры",
  }));
}

function getNomenclatureTypeCounts(items = directoryState.nomenclature || []) {
  return items.reduce((counts, item) => {
    const type = normalizeNomenclatureType(item.type);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
}

function getNomenclatureTypeFilterValue(items = directoryState.nomenclature || []) {
  const selected = ui.nomenclatureTypeFilter || "all";
  if (selected === "all") return selected;
  return getNomenclatureTypeOptions(items).some((item) => item.value === selected) ? selected : "all";
}

function getFilteredNomenclatureItems(items = directoryState.nomenclature || []) {
  const filterValue = getNomenclatureTypeFilterValue(items);
  if (filterValue === "all") return items;
  return items.filter((item) => normalizeNomenclatureType(item.type) === filterValue);
}

function getReaNomenclatureItems() {
  return (directoryState.nomenclature || [])
    .filter(isReaNomenclatureItem)
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "ru"));
}

function makeBomImportRowFromNomenclature(item, sequence) {
  return normalizeBomImportRow({
    nomenclatureId: item.id,
    values: [
      sequence,
      item.name || "",
      "",
      item.article || "",
      item.manufacturer || "",
      item.package || "",
      1,
      "Добавлено из номенклатуры",
      "",
    ],
  });
}

function getNextBomImportSequence(rows) {
  const maxSequence = rows.reduce((max, row, index) => {
    const number = Number(normalizeBomImportRow(row).sequence || index + 1);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return maxSequence + 1;
}

function updateBomImportRows(bomId, rows, options = {}) {
  const currentBom = getBomList(bomId);
  if (!currentBom) return null;

  const stamp = new Date().toISOString();
  const importRows = rows.map((row) => normalizeBomImportRow(row));
  const componentTotals = summarizeBomComponentFields(importRows);
  let nextBom = null;

  directoryState.bomLists = (directoryState.bomLists || []).map((item) => {
    if (item.id !== bomId) return item;
    nextBom = normalizeDirectoryRow("bomLists", {
      ...item,
      importHeaders: item.importHeaders?.length ? item.importHeaders : BOM_IMPORT_FALLBACK_HEADERS,
      importRows,
      importedAt: item.importedAt || stamp,
      updatedAt: stamp,
      ...componentTotals,
    });
    return nextBom;
  });

  if (options.syncNomenclature !== false && nextBom) {
    upsertBomImportRowsToNomenclature(nextBom, stamp);
  }

  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  persistDirectoryState();
  persistUiState();
  if (options.notify !== false) {
    notifySaveSuccess(options.message || "Таблица BOM сохранена");
  }
  return nextBom;
}

function updateBomImportCell(bomId, rowIndex, columnIndex, value) {
  const bom = getBomList(bomId);
  if (!bom) return;
  const rows = getBomImportRows(bom);
  const row = rows[rowIndex];
  if (!row || columnIndex < 0 || columnIndex >= BOM_IMPORT_COLUMN_COUNT) return;

  const nextValues = [...row.values];
  nextValues[columnIndex] = columnIndex === 6
    ? normalizeBomQuantityValue(value)
    : value;
  const nextRows = rows.map((item, index) => (
    index === rowIndex
      ? normalizeBomImportRow({ ...row, values: nextValues })
      : item
  ));
  updateBomImportRows(bomId, nextRows);
}

function deleteBomImportRow(bomId, rowIndex) {
  const bom = getBomList(bomId);
  if (!bom) return;
  const rows = getBomImportRows(bom).filter((_, index) => index !== rowIndex);
  updateBomImportRows(bomId, rows, { syncNomenclature: false });
}

function addNomenclatureToBom(bomId, nomenclatureId) {
  const bom = getBomList(bomId);
  const nomenclatureItem = (directoryState.nomenclature || []).find((item) => item.id === nomenclatureId);
  if (!bom || !nomenclatureItem) return;
  if (!isReaNomenclatureItem(nomenclatureItem)) {
    alert("В BOM можно добавить только номенклатуру из раздела «РЭА компоненты».");
    return;
  }

  const rows = getBomImportRows(bom);
  const nextRows = [
    ...rows,
    makeBomImportRowFromNomenclature(nomenclatureItem, getNextBomImportSequence(rows)),
  ];
  updateBomImportRows(bomId, nextRows);
}

function ensureBomResultsInNomenclature() {
  const bomLists = directoryState.bomLists || [];
  if (!bomLists.length) return;

  const stamp = new Date().toISOString();
  const nextItems = [...(directoryState.nomenclature || [])];
  let changed = false;

  bomLists.forEach((bom) => {
    const payload = makeBomResultNomenclaturePayload(bom, bom.updatedAt || bom.importedAt || stamp);
    if (!payload) return;

    const existingIndex = findBomResultNomenclatureIndex(nextItems, bom, payload);
    if (existingIndex >= 0) {
      const existing = nextItems[existingIndex];
      const nextItem = normalizeDirectoryRow("nomenclature", {
        ...existing,
        name: payload.name,
        article: payload.article || existing.article,
        type: "Печатные платы",
        package: existing.package || payload.package || "PCB",
        unit: existing.unit || "шт.",
        description: payload.description,
        status: existing.status || "Активен",
        sourceBomResultId: bom.id,
        sourceBomIds: mergeBomSourceIds(existing, payload),
        lastBomResultSyncAt: stamp,
        updatedAt: stamp,
      });
      if (JSON.stringify(existing) !== JSON.stringify(nextItem)) {
        nextItems[existingIndex] = nextItem;
        changed = true;
      }
      return;
    }

    nextItems.push(payload);
    changed = true;
  });

  if (!changed) return;
  directoryState.nomenclature = nextItems;
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  persistDirectoryState();
}

function migrateSpecificationBomRowsToNomenclature() {
  const specifications = directoryState.specifications || [];
  if (!specifications.length) return;

  let changed = false;
  const nextSpecifications = specifications.map((specification) => {
    const sourceItems = getSpecificationStructureItems(specification);
    if (!sourceItems.length) return specification;

    const nextItems = sourceItems.map((item) => {
      if (item.type !== "bom" || !item.bomListId) return item;
      const bom = getBomList(item.bomListId);
      const resultNomenclature = getBomResultNomenclatureItem(item.bomListId)
        || (bom ? upsertBomResultToNomenclature(bom, new Date().toISOString()) : null);
      if (!bom || !resultNomenclature) return item;

      changed = true;
      const operationName = item.operationName || "SMT-монтаж";
      return normalizeSpecificationStructureItem({
        ...item,
        type: "nomenclature",
        bomListId: "",
        nomenclatureId: resultNomenclature.id,
        executionType: "make",
        operationName,
        departmentName: item.departmentName || getDefaultSpekiDepartmentName(operationName),
        name: resultNomenclature.name || bom.resultItem || item.name || bom.name || "",
        unit: resultNomenclature.unit || "шт.",
        boardsPerPanel: 1,
        resultItem: resultNomenclature.name || bom.resultItem || item.resultItem || "",
        note: item.note && !/^bom\b/i.test(item.note) ? item.note : "Результат BOM",
      });
    });

    return syncSpecificationDerivedFields({
      ...specification,
      structureManaged: true,
      structureItems: nextItems,
    });
  });

  if (!changed) return;
  directoryState.specifications = nextSpecifications;
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  persistDirectoryState();
}

function ensureImportedBomRowsInNomenclature() {
  const bomLists = directoryState.bomLists || [];
  if (!bomLists.some((bom) => getBomImportRows(bom).length)) return;

  const stamp = new Date().toISOString();
  const nextItems = [...(directoryState.nomenclature || [])];
  let created = 0;

  bomLists.forEach((bom) => {
    getBomImportRows(bom).forEach((row) => {
      const payload = makeBomImportNomenclaturePayload(row, bom, bom.importedAt || bom.updatedAt || stamp);
      if (!payload) return;
      if (findImportedNomenclatureIndex(nextItems, payload) >= 0) return;
      nextItems.push(payload);
      created += 1;
    });
  });

  if (!created) return;
  directoryState.nomenclature = nextItems;
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  persistDirectoryState();
}

function upsertBomImportRowsToNomenclature(bom, stamp = new Date().toISOString()) {
  const rows = getBomImportRows(bom);
  if (!rows.length) return { created: 0, updated: 0 };

  const nextItems = [...(directoryState.nomenclature || [])];
  let created = 0;
  let updated = 0;

  rows.forEach((row) => {
    const payload = makeBomImportNomenclaturePayload(row, bom, stamp);
    if (!payload) return;

    const existingIndex = findImportedNomenclatureIndex(nextItems, payload);
    if (existingIndex >= 0) {
      const existing = nextItems[existingIndex];
      nextItems[existingIndex] = normalizeDirectoryRow("nomenclature", {
        ...existing,
        name: existing.name || payload.name,
        article: existing.article || payload.article,
        type: NOMENCLATURE_REA_COMPONENT_TYPE,
        package: existing.package || payload.package,
        unit: existing.unit || payload.unit || "шт.",
        manufacturer: existing.manufacturer || payload.manufacturer,
        description: existing.description || payload.description,
        status: existing.status || "Активен",
        sourceBomIds: mergeBomSourceIds(existing, payload),
        lastBomImportAt: stamp,
        updatedAt: stamp,
      });
      updated += 1;
      return;
    }

    nextItems.push(payload);
    created += 1;
  });

  directoryState.nomenclature = nextItems;
  return { created, updated };
}

function upsertBomResultToNomenclature(bom, stamp = new Date().toISOString()) {
  const payload = makeBomResultNomenclaturePayload(bom, stamp);
  if (!payload) return null;

  const nextItems = [...(directoryState.nomenclature || [])];
  const existingIndex = findBomResultNomenclatureIndex(nextItems, bom, payload);

  if (existingIndex >= 0) {
    const existing = nextItems[existingIndex];
    nextItems[existingIndex] = normalizeDirectoryRow("nomenclature", {
      ...existing,
      name: payload.name,
      article: payload.article || existing.article,
      type: "Печатные платы",
      package: existing.package || payload.package || "PCB",
      unit: existing.unit || "шт.",
      description: payload.description,
      status: existing.status || "Активен",
      sourceBomResultId: bom.id,
      sourceBomIds: mergeBomSourceIds(existing, payload),
      lastBomResultSyncAt: stamp,
      updatedAt: stamp,
    });
    directoryState.nomenclature = nextItems;
    return nextItems[existingIndex];
  }

  nextItems.push(payload);
  directoryState.nomenclature = nextItems;
  return payload;
}

async function importBomFromXlsxFile(file, projectId = "") {
  const parsed = await parseXlsxBomFile(file);
  const name = getFileBaseName(file.name);
  const id = makeId("bom");
  const importRows = parsed.rows.map((row) => normalizeBomImportRow(row));
  const componentTotals = summarizeBomComponentFields(importRows);
  const stamp = new Date().toISOString();
  const row = normalizeDirectoryRow("bomLists", {
    id,
    name,
    projectId: projectId || "",
    boardCode: name,
    resultItem: `Печатная плата ${name}`,
    status: "Активен",
    importHeaders: parsed.headers,
    importRows,
    importedAt: stamp,
    sourceFileName: file.name,
    sourceSheetName: parsed.sheetName,
    updatedAt: stamp,
    ...componentTotals,
  });

  directoryState.bomLists = [
    ...(directoryState.bomLists || []).filter((item) => item.name !== row.name || item.projectId !== row.projectId),
    row,
  ];
  upsertBomResultToNomenclature(row, stamp);
  upsertBomImportRowsToNomenclature(row, stamp);
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ui.activeBomId = id;
  ui.activeProjectId = projectId || "";
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess("BOM импортирован");
}

async function parseXlsxBomFile(file) {
  const entries = await readZipEntries(await file.arrayBuffer());
  const workbookXml = await getZipText(entries, "xl/workbook.xml");
  const sheetName = readFirstWorksheetName(workbookXml) || "Sheet1";
  const sheetEntryName = entries.has("xl/worksheets/sheet1.xml")
    ? "xl/worksheets/sheet1.xml"
    : [...entries.keys()].find((name) => name.startsWith("xl/worksheets/sheet") && name.endsWith(".xml"));
  if (!sheetEntryName) throw new Error("В файле не найден лист Excel.");

  const sharedStringsXml = entries.has("xl/sharedStrings.xml") ? await getZipText(entries, "xl/sharedStrings.xml") : "";
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const sheetXml = await getZipText(entries, sheetEntryName);
  const matrix = parseWorksheetMatrix(sheetXml, sharedStrings);
  const headers = Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, index) => (
    String(matrix[0]?.[index] || "").trim() || BOM_IMPORT_FALLBACK_HEADERS[index] || `Поле ${index + 1}`
  ));
  const rows = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index] || [];
    if (source[0] === undefined || source[0] === null || String(source[0]).trim() === "") break;
    rows.push(Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, columnIndex) => source[columnIndex] ?? ""));
  }

  if (!rows.length) throw new Error("BOM не содержит строк: первая пустая ячейка A найдена сразу после заголовка.");
  return { sheetName, headers, rows };
}

async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const textDecoder = new TextDecoder("utf-8");
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 66000);

  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Файл не похож на XLSX: не найден ZIP-каталог.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = textDecoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
    entries.set(name, {
      name,
      text: null,
      bytes: compressedBytes,
      compressionMethod,
    });

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function getZipText(entries, name) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`В XLSX не найден файл ${name}.`);
  if (entry.text !== null) return entry.text;

  let bytes = entry.bytes;
  if (entry.compressionMethod === 8) {
    if (!("DecompressionStream" in window)) {
      throw new Error("Браузер не поддерживает распаковку XLSX. Откройте систему в актуальном Chrome/Edge.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (entry.compressionMethod !== 0) {
    throw new Error(`Неподдерживаемый метод сжатия XLSX: ${entry.compressionMethod}.`);
  }

  entry.text = new TextDecoder("utf-8").decode(bytes);
  return entry.text;
}

function parseXml(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Не удалось прочитать XML внутри XLSX.");
  return xml;
}

function readFirstWorksheetName(workbookXml) {
  const sheet = parseXml(workbookXml).querySelector("sheet");
  return sheet?.getAttribute("name") || "";
}

function parseSharedStrings(sharedStringsXml) {
  return [...parseXml(sharedStringsXml).querySelectorAll("si")].map((item) => (
    [...item.querySelectorAll("t")].map((node) => node.textContent || "").join("")
  ));
}

function parseWorksheetMatrix(sheetXml, sharedStrings) {
  const matrix = [];
  const xml = parseXml(sheetXml);
  xml.querySelectorAll("sheetData row").forEach((rowNode) => {
    const rowIndex = Math.max(0, Number(rowNode.getAttribute("r") || matrix.length + 1) - 1);
    matrix[rowIndex] = matrix[rowIndex] || [];
    rowNode.querySelectorAll("c").forEach((cellNode) => {
      const ref = cellNode.getAttribute("r") || "";
      const columnIndex = columnLettersToIndex(ref.replace(/\d+/g, ""));
      if (columnIndex < 0 || columnIndex >= BOM_IMPORT_COLUMN_COUNT) return;
      matrix[rowIndex][columnIndex] = parseXlsxCellValue(cellNode, sharedStrings);
    });
  });
  return matrix;
}

function parseXlsxCellValue(cellNode, sharedStrings) {
  const type = cellNode.getAttribute("t");
  if (type === "inlineStr") return cellNode.querySelector("is t")?.textContent || "";
  const value = cellNode.querySelector("v")?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1";
  if (value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function columnLettersToIndex(letters) {
  if (!letters) return -1;
  return [...letters.toUpperCase()].reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function getDefaultComponentCounts() {
  const source = directoryState?.componentTypes?.length ? directoryState.componentTypes : DEFAULT_COMPONENT_TYPES;
  return Object.fromEntries(source.map((type) => [type.id, Math.max(0, Math.round(Number(type.defaultCount || 0)))]));
}

function getResourcesForWorkCenter(workCenterId) {
  const center = getWorkCenter(workCenterId);
  const matched = getProductionResourcesForWorkCenter(workCenterId)
    .filter((resource) => resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource));
  if (matched.length) return matched;
  if (!center) return [];
  return [makeFallbackProductionResource(center.id)];
}

function getDefaultSmtLineConfigurations() {
  return [
    {
      id: "smt-line-1",
      name: "SMT линия 1 · Hanwha S2/L2",
      type: "Линия",
      workCenter: "SMT-монтаж",
      capacity: "Hanwha S2 + Hanwha L2",
      baseCph: 32000,
      efficiency: 88,
      changeoverMin: 18,
      status: "Готова",
    },
    {
      id: "smt-line-2",
      name: "SMT линия 2 · Hanwha S2",
      type: "Линия",
      workCenter: "SMT-монтаж",
      capacity: "Hanwha S2",
      baseCph: 28000,
      efficiency: 82,
      changeoverMin: 24,
      status: "Готова",
    },
  ];
}

function getSmtLineConfigurations() {
  const resources = getProductionResourcesForWorkCenter("smt")
    .filter((resource) => resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource))
    .filter((resource) => resolveProductionResourceType(resource.type) === "line" || getSmtLineNumberFromText(`${resource.name} ${resource.code} ${resource.id}`))
    .filter((resource) => resource.status !== "Отключен");
  return resources.length ? resources : getDefaultSmtLineConfigurations();
}

function getSelectedSmtLineConfiguration({ fallback = false } = {}) {
  const lines = getSmtLineConfigurations();
  const selected = lines.find((line) => line.id === calculatorState.resourceId);
  if (selected) return selected;
  return fallback ? lines[0] || getDefaultSmtLineConfigurations()[0] : null;
}

function getSmtLineWorkCenterId(lineId) {
  return `${SMT_LINE_WORKCENTER_PREFIX}${lineId}`;
}

function isSmtLineWorkCenterId(workCenterId) {
  return String(workCenterId || "").startsWith(SMT_LINE_WORKCENTER_PREFIX);
}

function getSmtLineIdFromWorkCenterId(workCenterId) {
  return isSmtLineWorkCenterId(workCenterId)
    ? String(workCenterId).slice(SMT_LINE_WORKCENTER_PREFIX.length)
    : "";
}

function getSmtLineNumberFromText(value) {
  const text = String(value || "").toLowerCase();
  const match = text.match(/(?:smt|смт|линия)\s*[-–—№#]?\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function getStableStringHash(value) {
  return [...String(value || "")].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function findSmtLineByNumber(number, lines) {
  if (!number) return null;
  return lines.find((line, index) => (
    index + 1 === number
    || getSmtLineNumberFromText(`${line.name} ${line.code} ${line.id}`) === number
  )) || null;
}

function getSmtGanttLineCenters() {
  const smtCenter = getWorkCenter("smt") || {
    id: "smt",
    name: "SMT-монтаж",
    code: "SMT",
    unitsPerHour: WORK_CENTER_RATES.smt,
    capacity: 1,
    shift: "5/2 08:00-20:00",
    isActive: true,
  };

  return getSmtLineConfigurations().map((line, index) => {
    const lineNumber = getSmtLineNumberFromText(`${line.name} ${line.code} ${line.id}`) || index + 1;
    return {
      ...smtCenter,
      id: getSmtLineWorkCenterId(line.id),
      name: line.name || `SMT линия ${lineNumber}`,
      code: `SMT-${lineNumber}`,
      description: line.capacity || smtCenter.description || "Производственная линия SMT",
      parentWorkCenterId: "smt",
      baseWorkCenterId: "smt",
      calendarWorkCenterId: "smt",
      smtLineId: line.id,
      resourceId: line.id,
      capacity: 1,
      isSmtLine: true,
    };
  });
}

function getSlotAssignedSmtLineId(slot) {
  if (slot?.workCenterId !== "smt") return "";
  const lines = getSmtLineConfigurations();
  if (!lines.length) return "";

  const step = planningState.routeSteps.find((item) => item.id === slot.routeStepId);
  const explicitResourceId = slot.resourceId || step?.resourceId || "";
  if (explicitResourceId && lines.some((line) => line.id === explicitResourceId)) return explicitResourceId;

  const hintedLine = findSmtLineByNumber(
    getSmtLineNumberFromText(`${slot.comment || ""} ${slot.operationName || ""} ${explicitResourceId}`),
    lines,
  );
  if (hintedLine) return hintedLine.id;

  const hash = Math.abs(getStableStringHash(`${slot.projectId}:${slot.batchId}:${slot.routeStepId}:${slot.id}`));
  return lines[hash % lines.length]?.id || "";
}

function getSlotGanttWorkCenterId(slot) {
  if (slot?.workCenterId !== "smt") return slot?.workCenterId || "";
  const lineId = getSlotAssignedSmtLineId(slot);
  return lineId ? getSmtLineWorkCenterId(lineId) : "smt";
}

function getSlotGanttResourceId(slot) {
  if (!slot) return "";
  const step = planningState.routeSteps.find((item) => item.id === slot.routeStepId);
  const explicitResourceId = slot.resourceId || step?.resourceId || "";
  const explicitResource = explicitResourceId ? getProductionResource(explicitResourceId) : null;
  if (explicitResource && getProductionResourceWorkCenterId(explicitResource) === slot.workCenterId) {
    return explicitResource.id;
  }

  if (slot.workCenterId === "smt") {
    const lineId = getSlotAssignedSmtLineId(slot);
    if (lineId) return lineId;
  }

  const fallback = getResourcesForWorkCenter(slot.workCenterId)[0] || makeFallbackProductionResource(slot.workCenterId);
  return fallback.id;
}

function getResourceRowId(routeId, workCenterId, resourceId) {
  return `resource:${routeId}:${workCenterId}:${resourceId || "default"}`;
}

function getGanttResourcesForWorkCenter(workCenterId) {
  const resources = getProductionResourcesForWorkCenter(workCenterId, {
    includeInactive: false,
    includePassive: true,
  });
  const hasSchedulableResource = resources.some((resource) => (
    resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource)
  ));
  const rows = hasSchedulableResource ? resources : [...resources, makeFallbackProductionResource(workCenterId)];
  return dedupeProductionResources(rows).sort((left, right) => (
    Number(Boolean(right.participatesInPlanning === "yes" || right.participatesInCalculation === "yes"))
      - Number(Boolean(left.participatesInPlanning === "yes" || left.participatesInCalculation === "yes"))
    || String(left.parentResourceId || "").localeCompare(String(right.parentResourceId || ""), "ru")
    || String(left.name || "").localeCompare(String(right.name || ""), "ru")
  ));
}

function applyGanttRowToSlot(slot, row) {
  if (!slot || !["workCenter", "resource"].includes(row?.type)) return;
  if (row.type === "resource") {
    slot.workCenterId = row.workCenterId;
    slot.resourceId = row.resourceId || "";
    return;
  }

  if (row.isSmtLine || isSmtLineWorkCenterId(row.workCenterId)) {
    slot.workCenterId = "smt";
    slot.resourceId = row.smtLineId || getSmtLineIdFromWorkCenterId(row.workCenterId);
    return;
  }

  slot.workCenterId = row.workCenterId;
  const resource = getResourcesForWorkCenter(row.workCenterId)[0] || null;
  slot.resourceId = resource?.id || "";
}

function normalizeLookupText(value) {
  return String(value || "").trim().toLowerCase();
}

function getResourceBaseCph(resource) {
  const explicit = Number(resource?.baseCph || 0);
  if (explicit > 0) return explicit;
  const capacityMatch = String(resource?.capacity || "").match(/([\d.,]+)/);
  if (capacityMatch) {
    const parsed = Number(capacityMatch[1].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 100) return parsed;
  }
  return DEFAULT_RESOURCE_CPH;
}

function formatCalculatorNumber(value, digits = 1) {
  const number = Number(value || 0);
  const rounded = Math.round(number * 10 ** digits) / 10 ** digits;
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

function formatSecondsDuration(seconds) {
  const ms = Math.max(0, Number(seconds || 0) * 1000);
  if (ms < 60 * 1000) return `${formatCalculatorNumber(ms / 1000, 1)} сек`;
  return formatDuration(ms);
}

function getActiveProjectForModule() {
  if (ui.activeProjectId === "__new__") return null;
  return getProject(ui.activeProjectId)
    || getProductionContextForSpecification(getActiveSpecificationForModule());
}

function getActiveSpecificationForModule() {
  if (ui.activeSpecificationId === "__new__") return null;
  if (!ui.activeSpecificationId) return null;
  return (directoryState.specifications || []).find((specification) => specification.id === ui.activeSpecificationId)
    || null;
}

function getSpecificationProductionProject(specification) {
  if (!specification) return null;
  return getProductionContextForSpecification(specification);
}

function getSpecificationProductionQuantity(specification) {
  const project = getSpecificationProductionProject(specification);
  return normalizeOptionalPositiveInteger(specification?.productionQuantity || project?.totalQuantity) || "";
}

function getSpecificationProductionStatus(specification) {
  const project = getSpecificationProductionProject(specification);
  const status = specification?.productionStatus || project?.status || "planned";
  return PROJECT_STATUSES.includes(status) ? status : "planned";
}

function getSpecificationProductionDueDate(specification) {
  const project = getSpecificationProductionProject(specification);
  return specification?.dueDate || project?.dueDate || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000));
}

function getSpecificationProductionName(specification) {
  return specification?.outputItem || specification?.name || "Спецификация";
}

function getSpecificationProductionOrder(specification) {
  const project = getSpecificationProductionProject(specification);
  return specification?.orderNumber || project?.orderNumber || "";
}

function getSpecificationProductionCustomer(specification) {
  const project = getSpecificationProductionProject(specification);
  return specification?.customer || project?.customer || "";
}

function ensureSpecificationPlanningUnit(specification, routeTemplate = "full", options = {}) {
  const includeRoute = options.includeRoute !== false;
  const stamp = new Date().toISOString();
  const quantity = normalizeOptionalPositiveInteger(specification.productionQuantity) || 1;
  const dueDate = specification.dueDate || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000));
  const status = PROJECT_STATUSES.includes(specification.productionStatus) ? specification.productionStatus : "planned";
  const name = getSpecificationProductionName(specification);
  const specificationId = specification.id || makeId("spec");
  const existingRoute = (planningState.routes || []).find((route) => route.specificationId === specificationId || route.projectId === specificationId);
  const bundle = createProductionBundle({
    specificationId,
    name,
    orderNumber: specification.orderNumber || "",
    customer: specification.customer || "",
    totalQuantity: quantity,
    dueDate,
    status,
    routeTemplate,
  });

  if (!includeRoute && !existingRoute) {
    planningState.projects = [];
    planningState = normalizePlanningState(planningState);
    persistState();
    return specificationId;
  }

  planningState.batches = (planningState.batches || []).some((batch) => batch.routeId === (existingRoute?.id || bundle.route.id))
    ? planningState.batches.map((batch) => batch.routeId === (existingRoute?.id || bundle.route.id) ? {
        ...batch,
        specificationId,
        projectId: specificationId,
        quantity,
        status,
        updatedAt: stamp,
      } : batch)
    : [...planningState.batches, {
        ...bundle.batch,
        routeId: existingRoute?.id || bundle.route.id,
      }];

  if (includeRoute && !existingRoute) {
    planningState.routes = [...planningState.routes, bundle.route];
    planningState.routeSteps = [...planningState.routeSteps, ...bundle.routeSteps];
  } else if (existingRoute) {
    planningState.routes = planningState.routes.map((route) => route.id === existingRoute.id ? {
      ...route,
      specificationId,
      specificationName: specification.name || name,
      projectId: specificationId,
      updatedAt: stamp,
    } : route);
  }
  planningState.projects = [];
  planningState = normalizePlanningState(planningState);
  persistState();
  return specificationId;
}

function getActiveBomForModule(activeSpecification = null) {
  if (ui.activeBomId === "__new__") return null;
  const specBom = activeSpecification ? getBomList(activeSpecification.bomListA) : null;
  if (ui.activeBomId) {
    return (directoryState.bomLists || []).find((bom) => bom.id === ui.activeBomId) || null;
  }
  return specBom || null;
}

function getBomLinkedSpecifications(bomId) {
  if (!bomId) return [];
  return (directoryState.specifications || []).filter((specification) => (
    specification.bomListA === bomId
    || specification.bomListB === bomId
    || getSpecificationStructureItems(specification).some((item) => item.bomListId === bomId)
  ));
}

function renderSpecificationsPage() {
  const activeSpecification = getActiveSpecificationForModule();
  const isNewSpecification = ui.activeSpecificationId === "__new__" || !activeSpecification;
  const specification = activeSpecification || {
    id: "",
    name: "",
    projectId: "",
    outputItem: "",
    productionQuantity: "",
    dueDate: toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
    orderNumber: "",
    customer: "",
    productionStatus: "planned",
    bomListA: "",
    bomQtyA: 1,
    bomListB: "",
    bomQtyB: 0,
    extraItems: "",
    status: "Черновик",
  };
  const activeProject = getSpecificationProductionProject(specification);
  const productionQuantity = getSpecificationProductionQuantity(specification);
  const productionStatus = getSpecificationProductionStatus(specification);
  const dueDate = getSpecificationProductionDueDate(specification);
  const structureItems = getSpecificationStructureItems(specification);
  const specificationBomOptions = getSpecificationBomCandidates(specification, structureItems);
  const structureBomOptions = specificationBomOptions;
  const structureRows = getSpecificationStructureRows(specification);

  return `
    <section class="specifications-page module-data-page" data-layout="main-content" aria-label="Спецификации изделий">
      <aside class="directory-sidebar module-data-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Состав изделия</span>
          <h1>Спецификации</h1>
        </div>
        <div class="module-sidebar-actions">
          <button class="primary-button" data-specification-create type="button">${icon("plus")}<span>Новая спецификация</span></button>
        </div>
        <div class="module-entity-list">
          <div class="module-list-label">Спецификации изделий</div>
          ${isNewSpecification ? `<button class="module-entity-item is-active" type="button"><span><strong>Новая спецификация</strong><small>заполните форму справа</small></span><em>new</em></button>` : ""}
          ${(directoryState.specifications || []).map((item) => `
            <button class="module-entity-item ${item.id === activeSpecification?.id ? "is-active" : ""}" data-specification-open="${item.id}" type="button">
              <span><strong>${escapeHtml(item.name)}</strong><small>${Number(getSpecificationProductionQuantity(item) || 0).toLocaleString("ru-RU")} шт. · срок ${formatDate(getSpecificationProductionDueDate(item))}</small></span>
              <em>${escapeHtml(PROJECT_STATUS_LABELS[getSpecificationProductionStatus(item)] || item.status || "-")}</em>
            </button>
          `).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Конструктор состава</span>
            <h2>${escapeHtml(isNewSpecification ? "Новая спецификация изделия" : specification.name)}</h2>
            <p>${escapeHtml(activeProject ? `${getSpecificationProductionName(specification)}: спецификация является центральным объектом планирования и мониторинга.` : "Соберите спецификацию, укажите количество к производству и сохраните ее для планирования.")}</p>
          </div>
          <div class="directory-actions">
            <button class="secondary-button" data-open-spec-boms type="button">${icon("book")}<span>BOM-листы</span></button>
            <button class="secondary-button" data-specification-to-calculator type="button" ${activeSpecification ? "" : "disabled"}>${icon("calculator")}<span>В калькулятор</span></button>
            <button class="secondary-button danger" data-specification-delete="${escapeAttribute(specification.id)}" type="button" ${activeSpecification ? "" : "disabled"}>${icon("trash")}<span>Удалить</span></button>
          </div>
        </header>

        <div class="module-data-content specification-module-content">
          <section class="module-panel specification-editor-panel">
            <div class="report-card-head">
              <strong>Спецификация изделия</strong>
              <span>${isNewSpecification ? "создание производственной спецификации" : "центральный объект планирования"}</span>
            </div>
            <form id="specificationModuleForm" class="module-form">
              <input type="hidden" name="specificationId" value="${escapeAttribute(specification.id)}" />
              <input type="hidden" name="isNew" value="${isNewSpecification ? "yes" : "no"}" />
              <input type="hidden" name="projectId" value="${escapeAttribute(specification.projectId || "")}" />
              <label class="form-field"><span>Название</span><input name="name" value="${escapeAttribute(specification.name)}" placeholder="СП изделия" /></label>
              <label class="form-field full"><span>Итоговое изделие</span><input name="outputItem" value="${escapeAttribute(specification.outputItem)}" placeholder="Готовое изделие / узел" /></label>
              <label class="form-field"><span>Кол-во к производству</span><input name="productionQuantity" type="number" min="1" step="1" value="${escapeAttribute(productionQuantity)}" placeholder="например 1000" /></label>
              <label class="form-field"><span>Срок выпуска</span><input name="dueDate" type="date" value="${escapeAttribute(dueDate)}" /></label>
              <label class="form-field"><span>Заказ / партия</span><input name="orderNumber" value="${escapeAttribute(getSpecificationProductionOrder(specification))}" placeholder="№ / партия" /></label>
              <label class="form-field"><span>Заказчик</span><input name="customer" value="${escapeAttribute(getSpecificationProductionCustomer(specification))}" placeholder="Компания / внутренний заказ" /></label>
              <label class="form-field"><span>BOM A</span><select name="bomListA"><option value="">Не выбран</option>${specificationBomOptions.map((item) => `<option value="${item.id}" ${selected(specification.bomListA, item.id)}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
              <label class="form-field"><span>Кол-во A</span><input name="bomQtyA" type="number" min="0" step="1" value="${Number(specification.bomQtyA || 0)}" /></label>
              <label class="form-field"><span>BOM B</span><select name="bomListB"><option value="">Не выбран</option>${specificationBomOptions.map((item) => `<option value="${item.id}" ${selected(specification.bomListB, item.id)}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
              <label class="form-field"><span>Кол-во B</span><input name="bomQtyB" type="number" min="0" step="1" value="${Number(specification.bomQtyB || 0)}" /></label>
              <label class="form-field full"><span>Дополнительный состав</span><input name="extraItems" value="${escapeAttribute(specification.extraItems)}" placeholder="Корпус; кабель; крепеж; маркировка" /></label>
              <label class="form-field"><span>Статус</span><input name="status" value="${escapeAttribute(specification.status)}" /></label>
              <div class="module-status-field full">
                <span>Статус производства</span>
                <input type="hidden" name="productionStatus" data-spec-production-status-input value="${escapeAttribute(productionStatus)}" />
                <div class="module-status-segments" data-spec-production-status-group>
                  ${PROJECT_STATUSES.map((status) => `
                    <button class="${status === productionStatus ? "is-active" : ""}" data-spec-production-status-option="${status}" type="button">${escapeHtml(PROJECT_STATUS_LABELS[status] || status)}</button>
                  `).join("")}
                </div>
              </div>
              <div class="module-form-actions full">
                <button class="primary-button" type="submit">${icon("save")}<span>${isNewSpecification ? "Создать спецификацию" : "Сохранить спецификацию"}</span></button>
              </div>
            </form>
          </section>

          <section class="module-panel spec-structure-panel">
            <div class="report-card-head">
              <strong>Конструктор спецификации</strong>
              <span>узел изделия, платы BOM и дополнительные позиции</span>
            </div>
            ${renderSpecificationConstructor(specification, structureItems, structureBomOptions, isNewSpecification)}
          </section>

          <section class="module-panel spec-structure-table-panel">
            <div class="report-card-head">
              <strong>Таблица структуры спецификации</strong>
              <span>${structureRows.length ? `${structureRows.length} строк состава изделия` : "после заполнения конструктора здесь появится состав"}</span>
            </div>
            ${renderSpecificationStructureTable(structureRows)}
          </section>

        </div>
      </div>
    </section>
  `;
}

function renderSpekiPage() {
  const specifications = directoryState.specifications || [];
  const activeSpecification = specifications.find((specification) => specification.id === ui.activeSpecificationId) || null;
  const isEditing = Boolean(activeSpecification && ui.spekiEditingId === activeSpecification.id);

  return `
    <section class="speki-page module-data-page" data-layout="main-content" aria-label="Спецификации">
      <aside class="directory-sidebar module-data-sidebar speki-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Перечень</span>
          <h1>Спецификации</h1>
        </div>
        <div class="module-sidebar-actions">
          <button class="primary-button" data-speki-create-specification type="button">${icon("plus")}<span>Новая спецификация</span></button>
        </div>
        <div class="module-entity-list speki-spec-list">
          <div class="module-list-label">Спецификации</div>
          ${specifications.length ? specifications.map((specification) => `
              <button class="module-entity-item ${specification.id === activeSpecification?.id ? "is-active" : ""}" data-speki-spec-open="${escapeAttribute(specification.id)}" type="button">
                <span>
                  <strong>${escapeHtml(specification.name || "Спецификация без названия")}</strong>
                </span>
              </button>
            `).join("") : `
            <article class="module-empty-note">
              <strong>Спецификаций пока нет</strong>
              <span>Когда в системе появятся спецификации, они будут отображаться в этом перечне.</span>
            </article>
          `}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <div class="module-data-content speki-module-content">
          ${activeSpecification ? `
          <section class="module-panel speki-spec-table-panel">
            <div class="report-card-head">
              <strong>Таблица спецификации</strong>
              <span>${escapeHtml(activeSpecification.name || "выбранная спецификация")}</span>
            </div>
            ${renderSpekiStructureTable(activeSpecification, isEditing)}
          </section>
          ` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderSpekiStructureTable(specification, isEditing = false) {
  if (!specification) {
    return `
      <div class="bom-import-empty">
        ${icon("book")}
        <strong>Спецификация не выбрана</strong>
        <span>Выберите спецификацию в левом перечне, чтобы управлять ее составом.</span>
      </div>
    `;
  }

  const rows = getSpekiStructureTableRows(specification);
  const specificationOptions = [
    { value: "", label: "Выберите спецификацию", meta: "вложенный состав" },
    ...(directoryState.specifications || [])
      .filter((item) => item.id !== specification.id)
      .map((item) => ({
        value: item.id,
        label: item.name || "Спецификация без названия",
        meta: `${getSpecificationStructureItems(item).length} строк состава`,
      })),
  ];
  const nomenclatureOptions = [
    { value: "", label: "Выберите номенклатуру", meta: "позиция состава" },
    ...(directoryState.nomenclature || []).map((item) => ({
      value: item.id,
      label: item.name || "Позиция без названия",
      meta: [item.article, item.package || item.type].filter(Boolean).join(" · ") || "номенклатура",
    })),
  ];
  const typeOptions = [
    { value: "assembly", label: "Узел", meta: "группа строк состава" },
    { value: "specification", label: "Спецификация", meta: "вложенный узел изделия" },
    { value: "nomenclature", label: "Номенклатура", meta: "материал, плата или изделие" },
  ];
  const compositionSummary = getSpekiCompositionSummary(specification, rows);

  const miniCardMarkup = `
    <article class="speki-spec-mini-card">
      <label class="speki-spec-name-field">
        <span>Название спецификации</span>
        <input data-speki-spec-name="${escapeAttribute(specification.id)}" value="${escapeAttribute(specification.name || "")}" placeholder="Введите название спецификации" ${isEditing ? "" : "disabled"} />
      </label>
      <div class="speki-composition-strip" aria-label="Сводка состава спецификации">
        <article><span>Строк</span><strong>${compositionSummary.totalRows}</strong></article>
        <article><span>Узлов</span><strong>${compositionSummary.nodeCount}</strong></article>
        <article><span>Номенклатура</span><strong>${compositionSummary.nomenclatureCount}</strong></article>
        <article><span>Вложенные спеки</span><strong>${compositionSummary.nestedSpecificationCount}</strong></article>
      </div>
      <div class="speki-spec-card-actions">
        ${isEditing
          ? `<button class="primary-button" data-speki-save="${escapeAttribute(specification.id)}" type="button">${icon("save")}<span>Сохранить</span></button>`
          : `<button class="secondary-button" data-speki-edit="${escapeAttribute(specification.id)}" type="button">${icon("edit")}<span>Редактировать</span></button>`}
        <button class="secondary-button danger" data-speki-delete="${escapeAttribute(specification.id)}" type="button">${icon("trash")}<span>Удалить</span></button>
      </div>
    </article>
  `;

  return `
    ${miniCardMarkup}
    <div class="speki-structure-table-wrap" data-layout="table">
      <table class="directory-table speki-structure-table">
        <thead>
          <tr>
            <th>П/п</th>
            <th>Раздел</th>
            <th>Наименование</th>
            <th>Кол-во</th>
            <th>Ед.</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(({ item, number, level }, index) => {
            const linkedSpecification = item.type === "specification"
              ? (directoryState.specifications || []).find((entry) => entry.id === item.specificationId)
              : null;
            const bomResultItem = item.type === "bom" ? getBomResultNomenclatureItem(getSpecificationItemBomId(item)) : null;
            const nomenclatureItem = item.type === "nomenclature" || item.type === "part" || item.type === "bom"
              ? (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId) || bomResultItem
              : null;
            const rowType = item.type === "assembly" || item.type === "specification" ? item.type : "nomenclature";
            const objectSelect = rowType === "specification"
              ? renderDenseInlineSelect("specificationId", item.specificationId, specificationOptions, { type: "spekiStructureSpecification", itemId: item.id })
              : rowType === "assembly"
                ? `<input class="speki-node-name-input" data-speki-structure-input="${escapeAttribute(item.id)}" data-speki-structure-field="name" value="${escapeAttribute(item.name || "Новый узел")}" placeholder="Название узла" ${isEditing ? "" : "disabled"} />`
                : renderDenseInlineSelect("nomenclatureId", item.nomenclatureId || nomenclatureItem?.id || "", nomenclatureOptions, { type: "spekiStructureNomenclature", itemId: item.id });
            const objectLabel = rowType === "specification"
              ? linkedSpecification?.name || item.name || "Спецификация не выбрана"
              : rowType === "assembly"
                ? item.name || "Новый узел"
                : nomenclatureItem?.name || item.name || "Номенклатура не выбрана";
            const typeLabel = rowType === "assembly"
              ? "Узел"
              : rowType === "specification"
                ? "Спецификация"
                : "Номенклатура";
            const nextSibling = rows.slice(index + 1)
              .find((row) => row.level === level && (row.item.parentId || "root") === (item.parentId || "root"));
            const canCreateNode = isEditing && rowType !== "assembly" && Boolean(nextSibling);
            const objectMissing = rowType === "specification"
              ? !linkedSpecification
              : rowType === "assembly"
                ? !String(item.name || "").trim()
                : !nomenclatureItem;
            const quantityMissing = Number(item.quantity || 0) <= 0;
            const unitMissing = !String(item.unit || "").trim();
            const objectContent = isEditing ? objectSelect : `<span class="speki-static-cell">${escapeHtml(objectLabel)}</span>`;
            const rowNumberContent = `<span class="speki-row-number">${escapeHtml(number)}</span>`;

            return `
              <tr class="${rowType === "assembly" ? "is-speki-node" : ""}" data-speki-structure-row="${escapeAttribute(item.id)}" style="--speki-level: ${level};">
                <td>${rowNumberContent}</td>
                <td>${isEditing ? renderDenseInlineSelect("type", rowType, typeOptions, { type: "spekiStructureType", itemId: item.id }) : `<span class="speki-static-cell">${escapeHtml(typeLabel)}</span>`}</td>
                <td class="${objectMissing ? "is-speki-field-missing" : ""}"><div class="speki-object-cell">${objectContent}</div></td>
                <td class="${quantityMissing ? "is-speki-field-missing" : ""}">${isEditing ? `<input data-speki-structure-input="${escapeAttribute(item.id)}" data-speki-structure-field="quantity" type="number" inputmode="numeric" min="0" step="1" value="${Math.round(Number(item.quantity || 0))}" />` : `<span class="speki-static-cell">${escapeHtml(formatReportNumber(item.quantity || 0))}</span>`}</td>
                <td class="${unitMissing ? "is-speki-field-missing" : ""}">${isEditing ? `<input data-speki-structure-input="${escapeAttribute(item.id)}" data-speki-structure-field="unit" value="${escapeAttribute(item.unit)}" />` : `<span class="speki-static-cell">${escapeHtml(item.unit || "шт.")}</span>`}</td>
                <td>
                  <div class="speki-table-row-actions">
                    <button class="speki-node-button" data-speki-create-node-from-row="${escapeAttribute(item.id)}" type="button" title="Объединить эту и следующую строку в узел" ${canCreateNode ? "" : "disabled"}>${icon("split")}<span>Узел</span></button>
                    <button class="icon-button" data-speki-structure-outdent="${escapeAttribute(item.id)}" type="button" title="На уровень выше" ${!isEditing || level === 0 ? "disabled" : ""}>${icon("arrowLeft")}</button>
                    <button class="icon-button" data-speki-structure-indent="${escapeAttribute(item.id)}" type="button" title="На уровень ниже" ${!isEditing || index === 0 ? "disabled" : ""}>${icon("arrowRight")}</button>
                    <button class="icon-button" data-speki-structure-up="${escapeAttribute(item.id)}" type="button" title="Поднять" ${!isEditing || index === 0 ? "disabled" : ""}>${icon("chevronUp")}</button>
                    <button class="icon-button" data-speki-structure-down="${escapeAttribute(item.id)}" type="button" title="Опустить" ${!isEditing || index === rows.length - 1 ? "disabled" : ""}>${icon("chevronDown")}</button>
                    <button class="icon-button danger-soft" data-speki-structure-delete="${escapeAttribute(item.id)}" type="button" title="Удалить строку" ${isEditing ? "" : "disabled"}>${icon("trash")}</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("") : `
            <tr>
              <td colspan="6" class="primary-cell">
                <span class="component-name">Структура пока пустая</span>
                <small>Добавьте строку под таблицей и выберите тип: узел, спецификация или номенклатура.</small>
              </td>
            </tr>
          `}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6">
              <div class="speki-table-add-row">
                <button class="secondary-button" data-speki-add-row="assembly" type="button" ${isEditing ? "" : "disabled"}>${icon("split")}<span>Добавить узел</span></button>
                <button class="secondary-button" data-speki-add-row="nomenclature" type="button" ${isEditing ? "" : "disabled"}>${icon("plus")}<span>Добавить строку</span></button>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function getSpekiCompositionSummary(specification, rows = getSpekiStructureTableRows(specification)) {
  const items = getSpecificationStructureItems(specification);
  const directNomenclatureItems = items.filter((item) => item.type === "nomenclature" || item.type === "part" || item.type === "bom");
  const byNomenclatureType = directNomenclatureItems.reduce((acc, item) => {
    const nomenclature = (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId);
    const type = normalizeNomenclatureType(nomenclature?.type || "Прочее");
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return {
    totalRows: rows.length,
    bomCount: items.filter((item) => Boolean(getSpecificationItemBomId(item))).length,
    nodeCount: items.filter((item) => item.type === "assembly").length,
    nestedSpecificationCount: items.filter((item) => item.type === "specification").length,
    nomenclatureCount: directNomenclatureItems.length,
    makeCount: 0,
    buyCount: 0,
    issueCount: 0,
    byNomenclatureType,
  };
}

function renderSpekiSourcePalette(specification, compositionSummary = getSpekiCompositionSummary(specification)) {
  const bomCards = (directoryState.bomLists || []).map((bom) => {
    const rowsCount = getBomImportRows(bom).length;
    const componentTotal = Object.values(getBomComponentCounts(bom)).reduce((sum, count) => sum + Number(count || 0), 0);
    const resultNomenclature = getBomResultNomenclatureItem(bom.id);
    const resultName = resultNomenclature?.name || bom.resultItem || bom.boardCode || bom.name || "Печатная плата";
    return `
      <article class="speki-source-row">
        <div>
          <strong>${escapeHtml(resultName)}</strong>
          <span>${escapeHtml(bom.name || "BOM без названия")} · ${rowsCount || componentTotal} поз.</span>
        </div>
        <label><span>Кол-во</span><input data-speki-quick-qty type="number" inputmode="numeric" min="1" step="1" value="1" /></label>
        <button class="secondary-button" data-speki-quick-add="bomResult" data-speki-source-id="${escapeAttribute(bom.id)}" type="button">${icon("plus")}<span>Добавить</span></button>
      </article>
    `;
  }).join("");

  const nestedSpecificationCards = (directoryState.specifications || [])
    .filter((item) => item.id !== specification.id)
    .map((item) => `
      <article class="speki-source-row">
        <div>
          <strong>${escapeHtml(item.name || "Спецификация без названия")}</strong>
          <span>${getSpecificationStructureItems(item).length} строк состава</span>
        </div>
        <label><span>Кол-во</span><input data-speki-quick-qty type="number" inputmode="numeric" min="1" step="1" value="1" /></label>
        <button class="secondary-button" data-speki-quick-add="specification" data-speki-source-id="${escapeAttribute(item.id)}" type="button">${icon("plus")}<span>Добавить</span></button>
      </article>
    `).join("");

  const typeCounts = getNomenclatureTypeCounts(directoryState.nomenclature || []);
  const nomenclatureGroups = getNomenclatureTypeOptions(directoryState.nomenclature || [])
    .map((type) => ({
      type,
      items: (directoryState.nomenclature || [])
        .filter((item) => normalizeNomenclatureType(item.type) === type.value)
        .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "ru")),
    }))
    .filter((group) => group.items.length);

  return `
    <section class="speki-source-palette" aria-label="Источники состава спецификации">
      <div class="report-card-head">
        <strong>Добавить в спецификацию</strong>
        <span>выберите готовый источник состава: результат BOM, номенклатуру или вложенную спецификацию</span>
      </div>
      <div class="speki-source-summary">
        ${Object.entries(compositionSummary.byNomenclatureType).length
          ? Object.entries(compositionSummary.byNomenclatureType).map(([type, count]) => `<span>${escapeHtml(type)} · ${count}</span>`).join("")
          : `<span>Номенклатура еще не добавлена</span>`}
      </div>
      <div class="speki-source-grid">
        <details class="speki-source-group" open>
          <summary><strong>Печатные платы из BOM</strong><span>${(directoryState.bomLists || []).length}</span></summary>
          <div class="speki-source-list">
            ${bomCards || `<article class="module-empty-note"><strong>BOM-листов нет</strong><span>Импортируйте BOM в отдельном модуле, чтобы его результат появился как печатная плата.</span></article>`}
          </div>
        </details>
        <details class="speki-source-group">
          <summary><strong>Вложенные спецификации</strong><span>${(directoryState.specifications || []).filter((item) => item.id !== specification.id).length}</span></summary>
          <div class="speki-source-list">
            ${nestedSpecificationCards || `<article class="module-empty-note"><strong>Других спецификаций нет</strong><span>Этот источник станет доступен после создания второй спецификации.</span></article>`}
          </div>
        </details>
        <details class="speki-source-group" open>
          <summary><strong>Номенклатура по разделам</strong><span>${(directoryState.nomenclature || []).length}</span></summary>
          <div class="speki-source-nomenclature-groups">
            ${nomenclatureGroups.length ? nomenclatureGroups.map(({ type, items }) => `
              <details class="speki-source-subgroup" ${type.value !== NOMENCLATURE_REA_COMPONENT_TYPE ? "open" : ""}>
                <summary><strong>${escapeHtml(type.label)}</strong><span>${typeCounts[type.value] || items.length}</span></summary>
                <div class="speki-source-list">
                  ${items.map((item) => `
                    <article class="speki-source-row">
                      <div>
                        <strong>${escapeHtml(item.name || "Позиция без названия")}</strong>
                        <span>${escapeHtml([item.article, item.package, item.manufacturer].filter(Boolean).join(" · ") || type.meta || "номенклатура")}</span>
                      </div>
                      <label><span>Кол-во</span><input data-speki-quick-qty type="number" inputmode="numeric" min="1" step="1" value="1" /></label>
                      <button class="secondary-button" data-speki-quick-add="nomenclature" data-speki-source-id="${escapeAttribute(item.id)}" type="button">${icon("plus")}<span>Добавить</span></button>
                    </article>
                  `).join("")}
                </div>
              </details>
            `).join("") : `<article class="module-empty-note"><strong>Номенклатуры нет</strong><span>Добавьте позиции вручную или импортируйте BOM, чтобы РЭА компоненты появились автоматически.</span></article>`}
          </div>
        </details>
        <article class="speki-source-group speki-source-node-card">
          <div>
            <strong>Узел спецификации</strong>
            <span>объединяет несколько строк состава под общей операцией</span>
          </div>
          <button class="secondary-button" data-speki-quick-add="assembly" type="button">${icon("split")}<span>Добавить узел</span></button>
        </article>
      </div>
    </section>
  `;
}

function getSpekiStructureTableRows(specification) {
  const items = getSpecificationStructureItems(specification)
    .filter((item) => item.type === "assembly" || item.type === "bom" || item.type === "specification" || item.type === "nomenclature" || item.type === "part");
  const visibleIds = new Set(items.map((item) => item.id));
  const byParent = new Map();

  items.forEach((item) => {
    const parentId = item.parentId && visibleIds.has(item.parentId) ? item.parentId : "root";
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(item);
  });

  const rows = [];
  const visited = new Set();
  const appendChildren = (parentId, path, level) => {
    (byParent.get(parentId) || []).forEach((item, index) => {
      if (visited.has(item.id)) return;
      const nextPath = [...path, index + 1];
      visited.add(item.id);
      rows.push({ item, number: nextPath.join("."), level });
      appendChildren(item.id, nextPath, level + 1);
    });
  };

  appendChildren("root", [], 0);
  items.forEach((item) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    rows.push({ item, number: String(rows.length + 1), level: 0 });
  });

  return rows;
}

function renderSpekiSpecificationTree(specification, rows = getSpekiStructureTableRows(specification), staleItemIds = new Set(), duplicateBomItemIds = new Set()) {
  const items = getSpecificationStructureItems(specification);
  const bomCount = items.filter((item) => Boolean(getSpecificationItemBomId(item))).length;
  const nodeCount = items.filter((item) => item.type === "assembly").length;
  const buyCount = items.filter((item) => item.executionType === "buy").length;
  const issueCount = rows.filter(({ item }) => getSpekiTreeItemIssues(item, specification.id, staleItemIds, duplicateBomItemIds).length).length;

  return `
    <div class="speki-tree-view">
      <div class="speki-tree-summary">
        <article><span>Строк состава</span><strong>${rows.length}</strong><small>${nodeCount} узлов</small></article>
        <article><span>Печатных плат</span><strong>${bomCount}</strong><small>из BOM</small></article>
        <article><span>Покупных</span><strong>${buyCount}</strong><small>без операции</small></article>
        <article class="${issueCount ? "is-warning" : "is-ok"}"><span>Проверка</span><strong>${issueCount}</strong><small>${issueCount ? "требует внимания" : "замечаний нет"}</small></article>
      </div>
      <div class="speki-tree-view-wrap object-tree-wrap">
        <div class="object-tree-root">
          ${renderSpekiSpecificationTreeNode(specification, rows, staleItemIds, duplicateBomItemIds, new Set(), true)}
        </div>
      </div>
    </div>
  `;
}

function renderSpekiSpecificationTreeNode(specification, rows = getSpekiStructureTableRows(specification), staleItemIds = new Set(), duplicateBomItemIds = new Set(), visitedSpecificationIds = new Set(), open = false) {
  if (!specification) return renderObjectTreeLeaf("Спецификация не найдена", "Связанный объект был удален или еще не создан.", "warning");
  if (visitedSpecificationIds.has(specification.id)) {
    return renderObjectTreeLeaf(specification.name || "Повторная спецификация", "Повторная ссылка уже показана выше, ветка остановлена.", "warning");
  }

  const nextVisitedSpecificationIds = new Set(visitedSpecificationIds);
  nextVisitedSpecificationIds.add(specification.id);
  const items = getSpecificationStructureItems(specification)
    .filter((item) => item.type === "assembly" || item.type === "bom" || item.type === "specification" || item.type === "nomenclature" || item.type === "part");
  const rowMetaById = new Map((rows.length ? rows : getSpekiStructureTableRows(specification))
    .map((row) => [row.item.id, { number: row.number, level: row.level }]));
  const children = renderSpekiTreeChildren(items, "root", rowMetaById, staleItemIds, duplicateBomItemIds, nextVisitedSpecificationIds, specification.id);

  return renderObjectTreeNode({
    title: specification.name || "Спецификация без названия",
    meta: `${specification.outputItem || "выход не задан"} · ${items.length} позиций состава`,
    badge: "спека",
    tone: "specification",
    open,
    children: [children || renderObjectTreeLeaf("Структура пока пустая", "Нажмите «Редактировать» и добавьте строки состава.", "empty")],
  });
}

function renderSpekiTreeChildren(items, parentId, rowMetaById, staleItemIds, duplicateBomItemIds, visitedSpecificationIds, currentSpecificationId = "", visitedItemIds = new Set()) {
  const visibleIds = new Set(items.map((item) => item.id));
  const children = items.filter((item) => {
    const itemParentId = item.parentId && visibleIds.has(item.parentId) ? item.parentId : "root";
    return itemParentId === parentId;
  });

  return children.map((item) => {
    if (visitedItemIds.has(item.id)) return "";
    const nextVisitedItemIds = new Set(visitedItemIds);
    nextVisitedItemIds.add(item.id);
    const nestedChildren = renderSpekiTreeChildren(items, item.id, rowMetaById, staleItemIds, duplicateBomItemIds, visitedSpecificationIds, currentSpecificationId, nextVisitedItemIds);
    return renderSpekiTreeItemNode(item, rowMetaById.get(item.id), staleItemIds, duplicateBomItemIds, visitedSpecificationIds, nestedChildren, currentSpecificationId);
  }).join("");
}

function renderSpekiTreeItemNode(item, rowMeta = {}, staleItemIds = new Set(), duplicateBomItemIds = new Set(), visitedSpecificationIds = new Set(), nestedChildren = "", currentSpecificationId = "") {
  const bom = item.type === "bom" ? getBomList(item.bomListId) : null;
  const linkedSpecification = item.type === "specification"
    ? (directoryState.specifications || []).find((entry) => entry.id === item.specificationId)
    : null;
  const nomenclatureItem = item.type === "nomenclature" || item.type === "part"
    ? (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)
    : null;
  const title = item.type === "bom"
    ? bom?.name || item.name || "BOM не выбран"
    : item.type === "specification"
      ? linkedSpecification?.name || item.name || "Спецификация не выбрана"
      : item.type === "assembly"
        ? item.name || "Узел без названия"
        : nomenclatureItem?.name || item.name || "Номенклатура не выбрана";
  const executionValue = item.executionType || (item.type === "nomenclature" || item.type === "part" ? "buy" : "make");
  const executionLabel = executionValue === "buy" ? "покупное" : "к обеспечению";
  const defaultOperationLabel = item.type === "nomenclature" || item.type === "part"
    ? getDefaultSpekiOperationForNomenclature(nomenclatureItem, executionValue)
    : getDefaultSpekiOperationName(item.type, executionValue);
  const operationLabel = executionValue === "buy" ? "операция не требуется" : item.operationName || defaultOperationLabel || "операция не задана";
  const departmentLabel = executionValue === "buy" ? "" : item.departmentName || "подразделение не выбрано";
  const quantityLabel = `${Number(item.quantity || 0).toLocaleString("ru-RU")} ${item.unit || "шт."}`;
  const issues = getSpekiTreeItemIssues(item, currentSpecificationId, staleItemIds, duplicateBomItemIds);
  const meta = [
    getSpecificationTreeItemTypeLabel(item.type),
    quantityLabel,
    executionLabel,
    operationLabel,
    departmentLabel,
  ].filter(Boolean).join(" · ");
  const linkedSpecificationTree = linkedSpecification
    ? renderSpekiSpecificationTreeNode(linkedSpecification, getSpekiStructureTableRows(linkedSpecification), new Set(), new Set(), visitedSpecificationIds)
    : "";
  const bomPreview = getSpecificationItemBom(item) ? renderSpekiBomTreePreview(getSpecificationItemBom(item)) : "";

  return renderObjectTreeNode({
    title,
    meta,
    badge: rowMeta.number || getSpecificationTreeItemTypeLabel(item.type),
    tone: issues.length ? "warning" : item.type || "default",
    children: [
      issues.length ? renderObjectTreeLeaf("Требует внимания", issues.join("; "), "warning") : "",
      bomPreview,
      linkedSpecificationTree,
      nestedChildren,
      !issues.length && !bomPreview && !linkedSpecificationTree && !nestedChildren
        ? renderObjectTreeLeaf("Конечная позиция", item.resultItem || item.note || "Дочерних объектов нет.", "empty")
        : "",
    ],
  });
}

function getSpekiTreeItemIssues(item, specificationId = "", staleItemIds = new Set(), duplicateBomItemIds = new Set()) {
  const issues = [];
  const executionValue = item.executionType || (item.type === "nomenclature" || item.type === "part" ? "buy" : "make");
  if (item.type === "bom" && !getBomList(item.bomListId)) issues.push("BOM не выбран или удален");
  if (item.type === "nomenclature" && getNomenclatureSourceBomId(item.nomenclatureId) && !getSpecificationItemBom(item)) issues.push("исходный BOM для печатной платы удален");
  if (item.type === "specification" && !(directoryState.specifications || []).some((entry) => entry.id === item.specificationId && entry.id !== specificationId)) issues.push("вложенная спецификация не выбрана или удалена");
  if ((item.type === "nomenclature" || item.type === "part") && !(directoryState.nomenclature || []).some((entry) => entry.id === item.nomenclatureId)) issues.push("номенклатура не выбрана или удалена");
  if (item.type === "assembly" && !String(item.name || "").trim()) issues.push("название узла не заполнено");
  if (Number(item.quantity || 0) <= 0) issues.push("количество не заполнено");
  if (!String(item.unit || "").trim()) issues.push("единица измерения не заполнена");
  const nomenclatureItem = item.type === "nomenclature" || item.type === "part"
    ? (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)
    : null;
  const defaultOperation = item.type === "nomenclature" || item.type === "part"
    ? getDefaultSpekiOperationForNomenclature(nomenclatureItem, executionValue)
    : getDefaultSpekiOperationName(item.type, executionValue);
  if (executionValue === "make" && !String(item.operationName || defaultOperation || "").trim()) issues.push("операция не задана");
  if (executionValue === "make" && !String(item.departmentName || "").trim()) issues.push("подразделение не выбрано");
  if (staleItemIds.has(item.id)) issues.push("ссылка на объект удалена");
  if (duplicateBomItemIds.has(item.id)) issues.push("BOM уже выбран выше");
  return issues;
}

function renderSpekiBomTreePreview(bom) {
  const rows = getBomImportRows(bom);
  const componentTotal = Object.values(getBomComponentCounts(bom)).reduce((sum, count) => sum + Number(count || 0), 0);
  const previewRows = rows.slice(0, 8).map((row) => renderObjectTreeLeaf(
    row.description || row.manufacturerPart || row.designator || `Строка ${row.sequence || ""}`.trim(),
    `${row.designator || "позиция не задана"} · ${row.package || "типоразмер не задан"} · ${Number(row.quantity || 0).toLocaleString("ru-RU")} шт.`,
    "component",
  )).join("");
  const hiddenCount = Math.max(0, rows.length - 8);

  return renderObjectTreeNode({
    title: "Состав BOM",
    meta: rows.length ? `${rows.length} строк · ${componentTotal.toLocaleString("ru-RU")} компонентов` : `${componentTotal.toLocaleString("ru-RU")} компонентов по категориям`,
    badge: rows.length || componentTotal,
    tone: "bom",
    children: [
      rows.length
        ? previewRows
        : renderObjectTreeLeaf("Импортированных строк нет", "BOM заполнен вручную или пока пустой.", "warning"),
      hiddenCount ? renderObjectTreeLeaf(`Еще ${hiddenCount.toLocaleString("ru-RU")} строк`, "скрыто в компактном просмотре", "empty") : "",
    ],
  });
}

function isSpekiStructureItemReferenceStale(item, specificationId = "") {
  if (!item) return false;
  if (item.type === "bom") return Boolean(item.bomListId) && !getBomList(item.bomListId);
  if (item.type === "specification") {
    return Boolean(item.specificationId) && !(directoryState.specifications || [])
      .some((specification) => specification.id === item.specificationId && specification.id !== specificationId);
  }
  if (item.type === "nomenclature" || item.type === "part") {
    return Boolean(item.nomenclatureId) && !(directoryState.nomenclature || [])
      .some((entry) => entry.id === item.nomenclatureId);
  }
  return false;
}

function checkSpekiStructureReferences(specificationId) {
  const specification = (directoryState.specifications || []).find((item) => item.id === specificationId);
  if (!specification) return;
  const staleItemIds = getSpecificationStructureItems(specification)
    .filter((item) => isSpekiStructureItemReferenceStale(item, specification.id))
    .map((item) => item.id);

  ui.spekiCheckedSpecificationId = specification.id;
  ui.spekiStaleItemIds = staleItemIds;
  persistUiState();
  render();
  alert(staleItemIds.length
    ? `Проверка завершена: найдено ${staleItemIds.length} удаленных позиций. Они подсвечены желтым в колонке «Наименование».`
    : "Проверка завершена: удаленных позиций не найдено.");
}

function clearSpekiStaleItem(itemId = "") {
  if (!itemId || !Array.isArray(ui.spekiStaleItemIds) || !ui.spekiStaleItemIds.length) return;
  ui.spekiStaleItemIds = ui.spekiStaleItemIds.filter((id) => id !== itemId);
}

function isSpekiBomCollapsed(itemId = "") {
  return Boolean(itemId && (ui.spekiCollapsedBomIds || []).includes(itemId));
}

function toggleSpekiBomCollapse(itemId = "") {
  if (!itemId) return;
  const collapsedIds = new Set(ui.spekiCollapsedBomIds || []);
  if (collapsedIds.has(itemId)) {
    collapsedIds.delete(itemId);
  } else {
    collapsedIds.add(itemId);
  }
  ui.spekiCollapsedBomIds = [...collapsedIds];
  persistUiState();
  render();
}

function renderSpekiBomNomenclatureRows(item, bom, number, level, isCollapsed = false) {
  if (!getSpecificationItemBomId(item) || !bom) return "";
  const bomRows = getBomImportRows(bom);
  const childLevel = level + 1;
  const bomQuantity = Math.max(1, Math.round(Number(item.quantity || 1)));

  if (isCollapsed) return "";

  if (!bomRows.length) {
    return `
      <tr class="is-speki-bom-item is-empty" data-speki-bom-child="${escapeAttribute(item.id)}" style="--speki-level: ${childLevel};">
        <td><span class="speki-row-number">${escapeHtml(`${number}.0`)}</span></td>
        <td><span class="speki-static-cell">Номенклатура BOM</span></td>
        <td><span class="speki-static-cell">BOM импортирован без табличной номенклатуры</span></td>
        <td><span class="speki-static-cell">Покупное изделие</span></td>
        <td><span class="speki-static-cell">Операция не требуется</span></td>
        <td><span class="speki-static-cell">-</span></td>
        <td><span class="speki-static-cell">-</span></td>
        <td><span class="speki-static-cell">шт.</span></td>
        <td><span class="speki-bom-source-note">из BOM</span></td>
      </tr>
    `;
  }

  return bomRows.map((row, index) => {
    const quantity = Math.max(0, Number(row.quantity || 0)) * bomQuantity;
    const description = row.description || row.manufacturerPart || row.designator || "Позиция BOM";
    const details = [
      row.designator ? `Поз.: ${row.designator}` : "",
      row.manufacturerPart ? `PN: ${row.manufacturerPart}` : "",
      row.manufacturer ? row.manufacturer : "",
      row.package ? `Корпус: ${row.package}` : "",
    ].filter(Boolean).join(" · ");

    return `
      <tr class="is-speki-bom-item" data-speki-bom-child="${escapeAttribute(item.id)}" style="--speki-level: ${childLevel};">
        <td><span class="speki-row-number">${escapeHtml(`${number}.${index + 1}`)}</span></td>
        <td><span class="speki-static-cell">Номенклатура BOM</span></td>
        <td>
          <span class="speki-static-cell speki-bom-item-name" title="${escapeAttribute(details || description)}">${escapeHtml(description)}</span>
          ${details ? `<small class="speki-bom-item-meta">${escapeHtml(details)}</small>` : ""}
        </td>
        <td><span class="speki-static-cell">Покупное изделие</span></td>
        <td><span class="speki-static-cell">Операция не требуется</span></td>
        <td><span class="speki-static-cell">-</span></td>
        <td><span class="speki-static-cell">${Number.isFinite(quantity) && quantity > 0 ? escapeHtml(formatReportNumber(quantity)) : "-"}</span></td>
        <td><span class="speki-static-cell">шт.</span></td>
        <td><span class="speki-bom-source-note">из BOM</span></td>
      </tr>
    `;
  }).join("");
}

function renderSpekiWorkBreakdownTable(specification) {
  const rows = getSpekiWorkBreakdownRows(specification);
  return `
    <section class="speki-work-breakdown">
      <div class="report-card-head">
        <strong>Разбивка по работам</strong>
        <span>${rows.length ? `${rows.length} работ для маршрутной карты` : "работы появятся после выбора операций"}</span>
      </div>
      ${rows.length ? `
        <div class="speki-work-table-wrap" data-layout="table">
          <table class="directory-table speki-work-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Работа</th>
                <th>Подразделение</th>
                <th>Позиции спеки</th>
                <th>Входы</th>
                <th>Кол-во</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, index) => `
                <tr>
                  <td><span class="speki-row-number">${String(index + 1).padStart(2, "0")}</span></td>
                  <td class="primary-cell">${escapeHtml(row.operationName)}</td>
                  <td>${escapeHtml(row.departmentName)}</td>
                  <td>
                    <span class="speki-static-cell" title="${escapeAttribute(row.items.join("; "))}">${escapeHtml(row.itemsPreview)}</span>
                  </td>
                  <td>${escapeHtml(row.inputsLabel)}</td>
                  <td>${escapeHtml(row.quantityLabel)}</td>
                  <td><span class="speki-work-status ${row.isReady ? "is-ready" : "is-warning"}">${escapeHtml(row.status)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="bom-import-empty compact">
          ${icon("info")}
          <strong>Работы пока не заданы</strong>
          <span>Назначьте операции и подразделения строкам со статусом «К обеспечению», чтобы увидеть будущую маршрутную карту.</span>
        </div>
      `}
    </section>
  `;
}

function getSpekiWorkBreakdownRows(specification) {
  if (!specification) return [];
  const rows = getSpekiStructureTableRows(specification);
  const groups = new Map();

  rows.forEach(({ item, number }) => {
    const executionType = item.executionType || (item.type === "nomenclature" || item.type === "part" ? "buy" : "make");
    if (executionType !== "make") return;

    const operationName = item.operationName || getDefaultSpekiOperationName(item.type, executionType);
    if (!operationName) return;

    const departmentName = item.departmentName || "Подразделение не выбрано";
    const key = `${operationName}::${departmentName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        firstNumber: number,
        operationName,
        departmentName,
        items: [],
        quantities: [],
        bomInputCount: 0,
        directInputCount: 0,
      });
    }

    const group = groups.get(key);
    group.items.push(`${number} ${getSpekiStructureItemLabel(item)}`);
    group.quantities.push(`${formatReportNumber(item.quantity || 0)} ${item.unit || "шт."}`);

    const bom = getSpecificationItemBom(item);
    if (bom) group.bomInputCount += getBomImportRows(bom).length;

    group.directInputCount += rows.filter(({ item: candidate }) => (
      candidate.parentId === item.id
      && (candidate.executionType || (candidate.type === "nomenclature" || candidate.type === "part" ? "buy" : "make")) === "buy"
    )).length;
  });

  return [...groups.values()].map((group) => {
    const inputCount = group.bomInputCount + group.directInputCount;
    const itemsPreview = group.items.length > 2
      ? `${group.items.slice(0, 2).join("; ")} +${group.items.length - 2}`
      : group.items.join("; ");
    const quantityLabel = group.quantities.length > 2
      ? `${group.quantities.slice(0, 2).join("; ")} +${group.quantities.length - 2}`
      : group.quantities.join("; ");
    const isReady = group.departmentName !== "Подразделение не выбрано";
    return {
      ...group,
      itemsPreview,
      quantityLabel,
      inputsLabel: inputCount ? `${inputCount} покупн.` : "-",
      isReady,
      status: isReady ? "готово" : "нужно подразделение",
    };
  }).sort((left, right) => compareStructureNumbers(left.firstNumber, right.firstNumber));
}

function compareStructureNumbers(left, right) {
  const leftParts = String(left || "").split(".").map((part) => Number(part || 0));
  const rightParts = String(right || "").split(".").map((part) => Number(part || 0));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function getSpekiStructureItemLabel(item) {
  if (!item) return "Позиция";
  if (item.type === "bom") return getBomList(item.bomListId)?.name || item.name || "BOM не выбран";
  if (item.type === "specification") {
    return (directoryState.specifications || []).find((entry) => entry.id === item.specificationId)?.name
      || item.name
      || "Спецификация не выбрана";
  }
  if (item.type === "nomenclature" || item.type === "part") {
    return (directoryState.nomenclature || []).find((entry) => entry.id === item.nomenclatureId)?.name
      || item.name
      || "Номенклатура не выбрана";
  }
  return item.name || "Узел";
}

function createSpekiSpecification() {
  const existingSpecifications = directoryState.specifications || [];
  const index = existingSpecifications.length + 1;
  const stamp = new Date().toISOString();
  const id = makeId("spec");
  const row = normalizeDirectoryRow("specifications", {
    id,
    name: `Новая спецификация ${String(index).padStart(2, "0")}`,
    projectId: "",
    outputItem: `Изделие ${String(index).padStart(2, "0")}`,
    productionQuantity: 1,
    dueDate: toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
    orderNumber: "",
    customer: "",
    productionStatus: "planned",
    bomListA: "",
    bomQtyA: 0,
    bomListB: "",
    bomQtyB: 0,
    extraItems: "",
    status: "Черновик",
    structureManaged: true,
    structureItems: [],
    createdAt: stamp,
    updatedAt: stamp,
  });

  directoryState.specifications = [...existingSpecifications, syncSpecificationDerivedFields(row)];
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ui.activeSpecificationId = id;
  ui.spekiEditingId = id;
  ui.spekiCheckedSpecificationId = "";
  ui.spekiStaleItemIds = [];
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess("Спецификация создана");
  render();
}

function getActiveNomenclatureItem() {
  if (ui.activeNomenclatureId === "__new__") return null;
  if (!ui.activeNomenclatureId) return null;
  return getNomenclatureItem(ui.activeNomenclatureId);
}

function getNomenclatureItem(itemId) {
  return (directoryState.nomenclature || []).find((item) => item.id === itemId) || null;
}

function getNomenclatureDeleteUsage(itemId) {
  const specifications = (directoryState.specifications || []).filter((specification) => (
    getSpecificationStructureItems(specification).some((item) => item.nomenclatureId === itemId)
  ));
  const bomRowsCount = (directoryState.bomLists || []).reduce((sum, bom) => (
    sum + getBomImportRows(bom).filter((row) => row.nomenclatureId === itemId).length
  ), 0);

  return {
    specificationsCount: specifications.length,
    bomRowsCount,
  };
}

function renderModulePreviewEmpty({ iconName = "info", title, text, action = "" }) {
  return `
    <div class="bom-import-empty module-preview-empty">
      ${icon(iconName)}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
      ${action}
    </div>
  `;
}

function renderNomenclaturePage() {
  const allItems = directoryState.nomenclature || [];
  const items = getFilteredNomenclatureItems(allItems);
  const typeOptions = getNomenclatureTypeOptions(allItems);
  const typeCounts = getNomenclatureTypeCounts(allItems);
  const activeFilter = getNomenclatureTypeFilterValue(allItems);
  const activeItem = getActiveNomenclatureItem();
  const isNewItem = ui.activeNomenclatureId === "__new__";
  const hasPreviewObject = isNewItem || Boolean(activeItem);
  const rawItemType = normalizeNomenclatureType(activeItem?.type || NOMENCLATURE_REA_COMPONENT_TYPE);
  const itemType = typeOptions.some((type) => type.value === rawItemType)
    ? rawItemType
    : typeOptions[0]?.value || rawItemType;
  const item = activeItem || {
    id: "",
    name: "",
    article: "",
    type: NOMENCLATURE_REA_COMPONENT_TYPE,
    package: "",
    unit: "шт.",
    manufacturer: "",
    description: "",
    status: "Активен",
  };

  return `
    <section class="nomenclature-page module-data-page" data-layout="main-content" aria-label="Номенклатура">
      <aside class="directory-sidebar module-data-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Материалы и компоненты</span>
          <h1>Номенклатура</h1>
        </div>
        <div class="module-sidebar-actions">
          <button class="primary-button" data-nomenclature-create type="button">${icon("plus")}<span>Новая позиция</span></button>
        </div>
        <div class="nomenclature-type-filter" aria-label="Разделы номенклатуры">
          <button class="${activeFilter === "all" ? "is-active" : ""}" data-nomenclature-type-filter="all" type="button">
            <span>Все разделы</span>
            <em>${allItems.length}</em>
          </button>
          ${typeOptions.map((type) => `
            <button class="${activeFilter === type.value ? "is-active" : ""}" data-nomenclature-type-filter="${escapeAttribute(type.value)}" type="button">
              <span>${escapeHtml(type.label)}</span>
              <em>${typeCounts[type.value] || 0}</em>
            </button>
          `).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Список компонентов</span>
            <h2>${escapeHtml(hasPreviewObject ? (isNewItem ? "Новая позиция номенклатуры" : item.name || "Позиция без названия") : "Объект не выбран")}</h2>
            <p>${hasPreviewObject ? "Номенклатура разделяется по типам: РЭА для BOM, платы, механика, кабели, расходники и другие производственные позиции." : "Выберите позицию в таблице или создайте новую, чтобы открыть карточку редактирования."}</p>
          </div>
        </header>

        <div class="module-data-content nomenclature-module-content">
          ${hasPreviewObject ? `
          <section class="module-panel nomenclature-editor-panel">
            <div class="report-card-head">
              <strong>Предпросмотр позиции</strong>
              <span>${isNewItem ? "создание новой позиции" : "редактирование номенклатуры"}</span>
            </div>
            <form id="nomenclatureForm" class="module-form">
              <input type="hidden" name="itemId" value="${escapeAttribute(item.id)}" />
              <input type="hidden" name="isNew" value="${isNewItem ? "yes" : "no"}" />
              <input type="hidden" name="type" value="${escapeAttribute(itemType)}" data-nomenclature-type-hidden />
              <label class="form-field full"><span>Наименование</span><input name="name" value="${escapeAttribute(item.name)}" placeholder="Например: Резистор 10 кОм 0603 1%" /></label>
              <label class="form-field"><span>Артикул</span><input name="article" value="${escapeAttribute(item.article)}" placeholder="PN / MPN / внутренний код" /></label>
              <label class="form-field"><span>Раздел</span>${renderDenseInlineSelect("type", itemType, typeOptions, { type: "nomenclatureType" })}</label>
              <label class="form-field"><span>Новый раздел</span><input name="customType" value="" placeholder="если нужен отдельный тип" /></label>
              <label class="form-field"><span>Корпус / размер</span><input name="package" value="${escapeAttribute(item.package)}" placeholder="0603, QFN-32, PCB" /></label>
              <label class="form-field"><span>Ед. изм.</span><input name="unit" value="${escapeAttribute(item.unit)}" placeholder="шт." /></label>
              <label class="form-field"><span>Производитель</span><input name="manufacturer" value="${escapeAttribute(item.manufacturer)}" placeholder="Yageo, Murata, TI..." /></label>
              <label class="form-field"><span>Статус</span><input name="status" value="${escapeAttribute(item.status)}" placeholder="Активен" /></label>
              <label class="form-field full"><span>Описание</span><textarea name="description" rows="3" placeholder="Параметры, допуски, замены, комментарии">${escapeHtml(item.description)}</textarea></label>
              <div class="module-form-actions full">
                ${isNewItem ? "" : `<button class="secondary-button danger" data-nomenclature-delete="${escapeAttribute(item.id)}" type="button">${icon("trash")}<span>Удалить</span></button>`}
                <button class="primary-button" type="submit">${icon("save")}<span>${isNewItem ? "Создать позицию" : "Сохранить позицию"}</span></button>
              </div>
            </form>
          </section>
          ` : ""}

          <section class="module-panel nomenclature-list-panel">
            <div class="report-card-head">
              <strong>${hasPreviewObject ? "02" : "01"} · Список номенклатуры</strong>
              <span>${items.length ? `${items.length} из ${allItems.length} позиций` : "список пуст"}</span>
            </div>
            ${renderNomenclatureTable(items, activeItem)}
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderNomenclatureTable(items, activeItem) {
  if (!items.length) {
    return `
      <div class="bom-import-empty">
        ${icon("book")}
        <strong>Позиций пока нет</strong>
        <span>Нажмите «Новая позиция», заполните карточку и сохраните номенклатуру.</span>
      </div>
    `;
  }

  return `
    <div class="directory-table-wrap nomenclature-table-wrap" data-layout="table">
      <table class="directory-table nomenclature-table">
        <thead>
          <tr>
            <th>Наименование</th>
            <th>Артикул</th>
            <th>Раздел</th>
            <th>Корпус</th>
            <th>Ед.</th>
            <th>Производитель</th>
            <th>Статус</th>
            <th class="actions-cell">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((entry) => `
            <tr class="${entry.id === activeItem?.id ? "is-selected" : ""}" data-nomenclature-row-open="${escapeAttribute(entry.id)}">
              <td class="primary-cell" title="${escapeAttribute(entry.name || "Позиция без названия")}">${escapeHtml(entry.name || "Позиция без названия")}</td>
              <td title="${escapeAttribute(entry.article || "-")}">${escapeHtml(entry.article || "-")}</td>
              <td title="${escapeAttribute(entry.type || "-")}">${escapeHtml(entry.type || "-")}</td>
              <td title="${escapeAttribute(entry.package || "-")}">${escapeHtml(entry.package || "-")}</td>
              <td>${escapeHtml(entry.unit || "шт.")}</td>
              <td title="${escapeAttribute(entry.manufacturer || "-")}">${escapeHtml(entry.manufacturer || "-")}</td>
              <td>${escapeHtml(entry.status || "Активен")}</td>
              <td class="actions-cell">
                <button class="table-icon-button danger-soft" data-nomenclature-row-delete="${escapeAttribute(entry.id)}" type="button" title="Удалить позицию">${icon("trash")}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBomListsPage() {
  const activeBom = getActiveBomForModule();
  const isNewBom = ui.activeBomId === "__new__";
  const hasPreviewBom = isNewBom || Boolean(activeBom);
  const bom = activeBom || {
    id: "",
    name: "",
    projectId: "",
    boardCode: "",
    resultItem: "",
    status: "Черновик",
    ...Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, 0])),
  };
  const componentCounts = hasPreviewBom ? getBomComponentCounts(bom) : {};
  const componentTotal = Object.values(componentCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  const importRows = hasPreviewBom ? getBomImportRows(bom) : [];
  const importHeaders = hasPreviewBom ? getBomImportHeaders(bom) : [];

  return `
    <section class="bom-lists-page module-data-page" data-layout="main-content" aria-label="BOM-листы SMT">
      <aside class="directory-sidebar module-data-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Печатные платы</span>
          <h1>BOM-листы</h1>
        </div>
        <div class="module-sidebar-actions">
          <button class="primary-button" data-bom-create type="button">${icon("plus")}<span>Новый BOM</span></button>
        </div>
        <div class="module-entity-list">
          <div class="module-list-label">BOM SMT</div>
          ${isNewBom ? `<button class="module-entity-item is-active" type="button"><span><strong>Новый BOM</strong><small>компонентный состав платы</small></span><em>new</em></button>` : ""}
          ${(directoryState.bomLists || []).map((item) => {
            const hasImportRows = getBomImportRows(item).length > 0;
            const total = hasImportRows ? Object.values(getBomComponentCounts(item)).reduce((sum, count) => sum + Number(count || 0), 0) : 0;
            return `
              <button class="module-entity-item ${item.id === activeBom?.id ? "is-active" : ""}" data-bom-open="${item.id}" type="button">
                <span>
                  <strong class="module-entity-title"><span>${escapeHtml(item.name)}</span>${hasImportRows ? "" : ` <b class="module-status-chip">Черновик</b>`}</strong>
                  <small>${escapeHtml(item.boardCode || "код платы не задан")} · ${escapeHtml(item.resultItem || "результат BOM не задан")}</small>
                </span>
                <em>${total}</em>
              </button>
            `;
          }).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">BOM SMT</span>
            <h2>${escapeHtml(hasPreviewBom ? (isNewBom ? "Новый BOM-лист" : bom.name || "BOM без названия") : "BOM не выбран")}</h2>
            <p>${hasPreviewBom ? "BOM описывает компонентный состав печатной платы и создается без привязки к спецификации." : "Выберите BOM в левом перечне или создайте новый, чтобы открыть карточку и таблицу компонентов."}</p>
          </div>
        </header>

        <div class="module-data-content bom-module-content">
          ${hasPreviewBom ? `
          <section class="module-panel bom-editor-panel bom-combined-panel">
            <div class="report-card-head">
              <strong>BOM и компоненты</strong>
              <span>${isNewBom ? "создание компонентного состава" : `${importRows.length ? `${importRows.length} строк` : "таблица пока пустая"} · покомпонентный расчет платы`}</span>
            </div>
            <form id="bomModuleForm" class="module-form">
              <input type="hidden" name="bomId" value="${escapeAttribute(bom.id)}" />
              <input type="hidden" name="isNew" value="${isNewBom ? "yes" : "no"}" />
              <label class="form-field"><span>Название BOM</span><input name="name" value="${escapeAttribute(bom.name)}" placeholder="BOM PCB" /></label>
              <label class="form-field"><span>Код платы</span><input name="boardCode" value="${escapeAttribute(bom.boardCode)}" placeholder="PCB-..." /></label>
              <label class="form-field full"><span>Результат BOM</span><input name="resultItem" value="${escapeAttribute(bom.resultItem)}" placeholder="Печатная плата" /></label>
              <div class="module-form-actions full">
                <button class="primary-button" type="submit">${icon("save")}<span>${isNewBom ? "Создать BOM" : "Сохранить BOM"}</span></button>
                ${renderBomImportButton()}
                ${isNewBom ? "" : `<button class="secondary-button danger" data-bom-delete="${escapeAttribute(bom.id)}" type="button">${icon("trash")}<span>Удалить BOM</span></button>`}
              </div>
            </form>
            <div class="bom-combined-table-block">
              <div class="bom-combined-table-head">
                <strong>Таблица импортированного BOM</strong>
                <span>${importRows.length ? `${escapeHtml(bom.sourceFileName || bom.name)} · ${importRows.length} строк` : "стандартные поля Excel A:I"}</span>
              </div>
              ${renderBomImportTable(bom, importHeaders, importRows, componentCounts, componentTotal, isNewBom)}
            </div>
            ${importRows.length ? `
              <div class="bom-card-component-summary">
                <div class="module-list-label">Подсчет импортированных компонентов</div>
                ${renderBomComponentSummary(componentCounts, componentTotal)}
              </div>
            ` : ""}
          </section>

          ` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderBomImportButton() {
  return `
    <label class="primary-button bom-file-import-button">
      ${icon("upload")}
      <span>Импортировать Excel</span>
      <input data-bom-import-file type="file" accept=".xlsx,.xls" />
    </label>
  `;
}

function renderBomComponentSummary(componentCounts, componentTotal) {
  const counts = getBomComponentFieldCounts(componentCounts);
  const total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
  const activeTypes = Object.values(counts).filter((count) => Number(count || 0) > 0).length;
  return `
    <div class="bom-component-summary">
      <article>
        <span>Компонентов</span>
        <strong>${Number(total || componentTotal || 0).toLocaleString("ru-RU")}</strong>
        <small>на одну плату</small>
      </article>
      <article>
        <span>Типов</span>
        <strong>${activeTypes.toLocaleString("ru-RU")}</strong>
        <small>заполненных категорий</small>
      </article>
      ${BOM_COMPONENT_FIELDS.map((field) => `
        <article>
          <span>${escapeHtml(field.label)}</span>
          <strong>${Number(counts[field.key] || 0).toLocaleString("ru-RU")}</strong>
          <small>шт.</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderBomNomenclatureAddControl(bom, isNewBom = false) {
  const reaItems = getReaNomenclatureItems();
  if (isNewBom || !bom?.id) {
    return `
      <div class="bom-nomenclature-add is-disabled">
        ${icon("package")}
        <span>Сначала сохраните карточку BOM, затем можно будет добавлять РЭА-компоненты из номенклатуры.</span>
      </div>
    `;
  }

  if (!reaItems.length) {
    return `
      <div class="bom-nomenclature-add is-disabled">
        ${icon("package")}
        <span>В номенклатуре пока нет позиций типа «${NOMENCLATURE_REA_COMPONENT_TYPE}». Импортируйте BOM или создайте компонент в модуле «Номенклатура».</span>
      </div>
    `;
  }

  const options = [
    { value: "", label: "Добавить РЭА компонент", meta: "выберите позицию номенклатуры" },
    ...reaItems.map((item) => ({
      value: item.id,
      label: item.name || "Компонент без названия",
      meta: `${item.article || "артикул не задан"} · ${item.package || "корпус не задан"}`,
    })),
  ];

  return `
    <div class="bom-nomenclature-add">
      <div>
        ${icon("package")}
        <span>Добавить строку из номенклатуры</span>
      </div>
      ${renderDenseInlineSelect("nomenclatureId", "", options, { type: "bomNomenclature", bomId: bom.id })}
    </div>
  `;
}

function renderBomImportCellInput(bomId, rowIndex, columnIndex, value) {
  const isQuantity = columnIndex === 6;
  return `
    <input
      class="bom-edit-input"
      data-bom-import-cell="${escapeAttribute(bomId)}"
      data-bom-row-index="${rowIndex}"
      data-bom-column-index="${columnIndex}"
      ${isQuantity ? `type="number" min="0" step="1"` : `type="text"`}
      value="${escapeAttribute(value)}"
      aria-label="Поле BOM ${rowIndex + 1}.${columnIndex + 1}"
    />
  `;
}

function renderBomImportPreviewTable() {
  return `
    <div class="bom-import-table-wrap bom-import-preview-wrap" data-layout="table">
      <table class="directory-table bom-import-table bom-import-preview-table">
        <thead>
          <tr>
            ${BOM_IMPORT_FALLBACK_HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          <tr class="is-preview-row">
            ${BOM_IMPORT_FALLBACK_HEADERS.map(() => "<td>&nbsp;</td>").join("")}
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderBomImportTable(bom, headers, rows, componentCounts, componentTotal, isNewBom = false) {
  if (!rows.length) {
    return renderBomImportPreviewTable();
  }

  return `
    <div class="bom-import-table-wrap" data-layout="table">
      <table class="directory-table bom-import-table">
        <thead>
          <tr>
            ${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}
            <th class="actions-cell">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, rowIndex) => `
            <tr>
              ${row.values.map((value, columnIndex) => `
                <td class="${columnIndex === 1 ? "primary-cell" : ""}">
                  ${renderBomImportCellInput(bom.id, rowIndex, columnIndex, value)}
                </td>
              `).join("")}
              <td class="actions-cell bom-row-action-cell">
                <button class="table-icon-button danger-soft" data-bom-import-delete="${escapeAttribute(bom.id)}" data-bom-row-index="${rowIndex}" type="button" title="Удалить строку BOM">${icon("trash")}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="${BOM_IMPORT_COLUMN_COUNT + 1}">
              <div class="bom-import-table-footer">
                ${renderBomNomenclatureAddControl(bom, isNewBom)}
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderSpecificationConstructor(specification, structureItems, bomOptions, isNewSpecification) {
  const rootTitle = specification.outputItem || specification.name || "Итоговое изделие не задано";
  const assemblyOptions = structureItems
    .filter((item) => item.type === "assembly")
    .map((item) => ({
      value: item.id,
      label: item.name || "Узел без названия",
      meta: "узел спецификации",
    }));
  const parentOptions = [
    { value: "root", label: "Итоговое изделие", meta: rootTitle },
    ...assemblyOptions,
  ];

  return `
    <div class="spec-constructor">
      <article class="spec-constructor-root">
        <span class="spec-constructor-root-icon">${icon("split")}</span>
        <span>
          <strong>${escapeHtml(rootTitle)}</strong>
          <small>${escapeHtml(specification.name || "сначала заполните карточку спецификации")}</small>
        </span>
        <em>${structureItems.length ? `${structureItems.length} позиций` : "пусто"}</em>
      </article>
      <div class="spec-constructor-actions">
        <button class="secondary-button" data-spec-add-item="assembly" type="button" ${isNewSpecification ? "disabled" : ""}>${icon("plus")}<span>Добавить узел</span></button>
        <button class="secondary-button" data-spec-add-item="bom" type="button" ${isNewSpecification ? "disabled" : ""}>${icon("plus")}<span>Добавить плату BOM</span></button>
        <button class="secondary-button" data-spec-add-item="part" type="button" ${isNewSpecification ? "disabled" : ""}>${icon("plus")}<span>Добавить позицию</span></button>
      </div>
      <div class="spec-constructor-list">
        ${isNewSpecification ? `
          <div class="bom-import-empty compact">
            ${icon("info")}
            <strong>Сначала сохраните спецификацию</strong>
            <span>После создания карточки здесь можно будет собирать структуру изделия из узлов, BOM-плат и дополнительных позиций.</span>
          </div>
        ` : structureItems.length ? structureItems.map((item, index) => renderSpecificationConstructorItem(item, index, structureItems.length, bomOptions, parentOptions)).join("") : `
          <div class="bom-import-empty compact">
            ${icon("plus")}
            <strong>Структура пока пустая</strong>
            <span>Добавьте узел изделия, одну или несколько плат BOM и дополнительные материалы.</span>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderSpecificationConstructorItem(item, index, total, bomOptions, parentOptions) {
  const bom = item.type === "bom" ? getBomList(item.bomListId) : null;
  const typeLabels = {
    assembly: "Узел",
    bom: "Плата BOM",
    part: "Позиция",
  };
  const typeOptions = [
    { value: "assembly", label: "Узел" },
    { value: "bom", label: "BOM" },
    { value: "part", label: "Позиция" },
  ];
  const safeParentOptions = parentOptions.filter((option) => option.value !== item.id);
  const bomSelectOptions = [
    { value: "", label: "Выберите BOM", meta: "результат SMT-операции" },
    ...bomOptions.map((option) => ({
      value: option.id,
      label: option.name,
      meta: option.resultItem || option.boardCode || getProject(option.projectId)?.name || "",
    })),
  ];
  const parentValue = safeParentOptions.some((option) => option.value === item.parentId) ? item.parentId : "root";
  const namePlaceholder = item.type === "assembly" ? "Например: Электронный узел" : "Например: корпус, крепеж, кабель";

  return `
    <article class="spec-constructor-item is-${escapeAttribute(item.type)}" data-spec-structure-item="${escapeAttribute(item.id)}">
      <div class="spec-constructor-index">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <small>${escapeHtml(typeLabels[item.type] || "Позиция")}</small>
      </div>
      <div class="spec-constructor-type" role="group" aria-label="Тип позиции спецификации">
        ${typeOptions.map((option) => `
          <button class="${item.type === option.value ? "is-active" : ""}" data-spec-structure-type="${escapeAttribute(item.id)}" data-spec-structure-type-value="${escapeAttribute(option.value)}" type="button">${escapeHtml(option.label)}</button>
        `).join("")}
      </div>
      <div class="spec-constructor-field is-main">
        <span>${item.type === "bom" ? "BOM-лист" : "Название"}</span>
        ${item.type === "bom" ? renderDenseInlineSelect("bomListId", item.bomListId, bomSelectOptions, { type: "specStructureBom", itemId: item.id }) : `
          <input data-spec-structure-input="${escapeAttribute(item.id)}" data-spec-structure-field="name" value="${escapeAttribute(item.name)}" placeholder="${escapeAttribute(namePlaceholder)}" />
        `}
      </div>
      <div class="spec-constructor-field">
        <span>Родитель</span>
        ${renderDenseInlineSelect("parentId", parentValue, safeParentOptions, { type: "specStructureParent", itemId: item.id })}
      </div>
      <label class="spec-constructor-field is-quantity">
        <span>Кол-во</span>
        <input data-spec-structure-input="${escapeAttribute(item.id)}" data-spec-structure-field="quantity" type="number" min="0" step="0.01" value="${Number(item.quantity || 0)}" />
      </label>
      <label class="spec-constructor-field is-unit">
        <span>Ед.</span>
        <input data-spec-structure-input="${escapeAttribute(item.id)}" data-spec-structure-field="unit" value="${escapeAttribute(item.unit)}" />
      </label>
      <label class="spec-constructor-field is-note">
        <span>${item.type === "bom" ? "Результат / примечание" : "Примечание"}</span>
        <input data-spec-structure-input="${escapeAttribute(item.id)}" data-spec-structure-field="${item.type === "bom" ? "note" : "note"}" value="${escapeAttribute(item.note)}" placeholder="${escapeAttribute(item.type === "bom" ? bom?.resultItem || item.resultItem || "смонтированная плата" : "назначение в сборке")}" />
      </label>
      <div class="spec-constructor-item-actions">
        <button class="icon-button" data-spec-structure-up="${escapeAttribute(item.id)}" type="button" title="Поднять" ${index === 0 ? "disabled" : ""}>${icon("chevronUp")}</button>
        <button class="icon-button" data-spec-structure-down="${escapeAttribute(item.id)}" type="button" title="Опустить" ${index === total - 1 ? "disabled" : ""}>${icon("chevronDown")}</button>
        <button class="icon-button danger-soft" data-spec-structure-delete="${escapeAttribute(item.id)}" type="button" title="Удалить позицию">${icon("trash")}</button>
      </div>
    </article>
  `;
}

function renderSpecificationStructureTable(rows) {
  if (!rows.length) {
    return `
      <div class="bom-import-empty">
        ${icon("info")}
        <strong>Структура спецификации пока не заполнена</strong>
        <span>Добавьте позиции в конструкторе выше, чтобы получить табличный состав изделия.</span>
      </div>
    `;
  }

  return `
    <div class="spec-structure-table-wrap" data-layout="table">
      <table class="directory-table spec-structure-table">
        <thead>
          <tr>
            <th>Поз.</th>
            <th>Уровень</th>
            <th>Тип</th>
            <th>Наименование</th>
            <th>Источник</th>
            <th>Кол-во</th>
            <th>Ед.</th>
            <th>Результат</th>
            <th>Примечание</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.level === 0 ? "is-root-row" : ""}">
              <td>${escapeHtml(row.position)}</td>
              <td>${escapeHtml(row.level === 0 ? "Изделие" : `L${row.level}`)}</td>
              <td>${escapeHtml(row.type)}</td>
              <td class="primary-cell"><span class="spec-level-${Math.min(4, Math.max(0, Number(row.level || 0)))}">${escapeHtml(row.name)}</span></td>
              <td>${escapeHtml(row.source)}</td>
              <td>${Number(row.quantity || 0).toLocaleString("ru-RU")}</td>
              <td>${escapeHtml(row.unit)}</td>
              <td>${escapeHtml(row.result || "-")}</td>
              <td>${escapeHtml(row.note || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function getSpecificationById(specificationId) {
  return (directoryState.specifications || [])
    .find((specification) => specification.id === specificationId) || null;
}

function getRouteSpecification(route) {
  return getSpecificationById(route?.specificationId)
    || getSpecificationByProjectId(route?.projectId)
    || null;
}

function ensureRouteModuleProjectForSpecification(specification) {
  if (!specification) return "";
  const specificationId = ensureSpecificationPlanningUnit(specification, "full", { includeRoute: false });
  if (!specificationId) return "";
  if (!specification.projectId) return specificationId;

  const stamp = new Date().toISOString();
  directoryState.specifications = (directoryState.specifications || []).map((item) => (
    item.id === specification.id
      ? syncSpecificationDerivedFields({ ...item, projectId: "", updatedAt: stamp })
      : item
  ));
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  persistDirectoryState();
  return specificationId;
}

function resolveRouteModuleProjectId(selectionValue, options = {}) {
  const value = String(selectionValue || "");
  if (!value) return "";

  const specification = getSpecificationById(value) || getSpecificationByProjectId(value);
  if (specification) {
    if (getProject(specification.id)) return specification.id;
    return options.createPlanningUnit === false
      ? ""
      : ensureRouteModuleProjectForSpecification(specification);
  }

  return getProject(value)?.id || value;
}

function getRouteModuleSelectionValue(route, fallbackSpecification = null) {
  const routeSpecification = getRouteSpecification(route);
  if (routeSpecification) return routeSpecification.id;
  if (route?.specificationId) return route.specificationId;
  if (route?.projectId) return route.projectId;
  if (fallbackSpecification) return fallbackSpecification.id;
  return "";
}

function getRouteModuleSelectionName(route, fallbackSpecification = null) {
  const specification = getRouteSpecification(route) || fallbackSpecification;
  if (specification) return specification.name || "Спецификация без названия";
  return getProjectDisplayName(getProject(route?.projectId)) || "";
}

function getRoutesForModule() {
  return [...(planningState.routes || [])].sort((left, right) => {
    const leftProject = getProjectDisplayName(getProject(left.specificationId || left.projectId)) || "";
    const rightProject = getProjectDisplayName(getProject(right.specificationId || right.projectId)) || "";
    return leftProject.localeCompare(rightProject, "ru") || String(left.name || "").localeCompare(String(right.name || ""), "ru");
  });
}

function getRouteStepsForModule(routeId) {
  return (planningState.routeSteps || [])
    .filter((step) => step.routeId === routeId)
    .sort((left, right) => {
      const taskDelta = getRouteStepTaskId(left).localeCompare(getRouteStepTaskId(right), "ru");
      return taskDelta || Number(left.stepOrder || 0) - Number(right.stepOrder || 0);
    });
}

function getRouteStepTaskId(step) {
  return step?.specTaskId || MAIN_ROUTE_TASK_ID;
}

function getRouteStepsForTask(steps, taskId) {
  return (steps || [])
    .filter((step) => getRouteStepTaskId(step) === taskId)
    .sort((left, right) => Number(left.stepOrder || 0) - Number(right.stepOrder || 0));
}

function getWorkCenterIdForRouteTask(task) {
  const targetUnit = (planningState.workCenters || []).find((center) => (
    isPlanningWorkCenter(center)
    && normalizeLookupText(center.name) === normalizeLookupText(task?.departmentName)
  ));
  if (targetUnit) return targetUnit.id;

  const text = `${task?.operationName || ""} ${task?.departmentName || ""} ${task?.title || ""}`.toLowerCase();
  if (text.includes("smt") || text.includes("smd") || text.includes("паяль") || text.includes("оплав")) return "smt";
  if (text.includes("aoi") || text.includes("аои") || text.includes("инспек")) return "aoi";
  if (text.includes("отмыв")) return "wash";
  if (text.includes("tht") || text.includes("ручн") || text.includes("выводн")) return "manual";
  if (text.includes("тест") || text.includes("контрол") || text.includes("испыт")) return "test";
  if (text.includes("лакир")) return "coating";
  if (text.includes("слесар") || text.includes("механ")) return "mechanic";
  if (text.includes("сбор")) return "assembly";
  return getPlanningWorkCenters({ includeWarehouse: false })[0]?.id || "manual";
}

function getRouteStepTemplate(workCenterId, operationName = "") {
  const center = getWorkCenter(workCenterId);
  const resolvedWorkCenterId = center?.id || workCenterId;
  const resources = getResourcesForWorkCenter(resolvedWorkCenterId);
  const resource = resources[0] || null;
  const calculationType = getDefaultOperationCalculationType(resolvedWorkCenterId);
  return {
    workCenterId: resolvedWorkCenterId,
    operationName: operationName || center?.name || "Операция",
    unitsPerHour: getWorkCenterUnitsPerHour(resolvedWorkCenterId),
    resourceId: resource?.id || "",
    calculationType,
    secondsPerPanel: calculationType === "manual" || calculationType === "normative"
      ? getDefaultSecondsPerPanel(resolvedWorkCenterId, 1)
      : 0,
    setupMin: Number(resource?.changeoverMin || 0),
  };
}

function getRouteTaskTemplateSteps(task) {
  const templates = [];
  const addTemplate = (workCenterId, operationName = "") => {
    const center = getWorkCenter(workCenterId);
    if (!center) return;
    const key = `${center.id}::${operationName || center.name}`;
    if (templates.some((template) => `${template.workCenterId}::${template.operationName}` === key)) return;
    templates.push(getRouteStepTemplate(center.id, operationName || center.name));
  };

  if (task?.type === "bom") {
    addTemplate(task.workCenterId || "smt", task.operationName || "SMT-монтаж");
    addTemplate("aoi", "AOI-контроль");
    addTemplate("wash", "Отмывка");
    addTemplate("warehouse", "Склад");
    return templates;
  }

  if (task?.type === "assembly" || task?.type === "specification") {
    addTemplate(task.workCenterId || "assembly", task.operationName || "Сборка");
    addTemplate("test", "Тестирование");
    addTemplate("warehouse", "Склад");
    return templates;
  }

  addTemplate(task?.workCenterId || "manual", task?.operationName || "Операция");
  addTemplate("warehouse", "Склад");
  return templates;
}

function createRouteStepFromTaskTemplate(routeId, task, template, stepOrder, stamp = new Date().toISOString()) {
  return {
    id: makeId("rs"),
    routeId,
    specTaskId: task.id === MAIN_ROUTE_TASK_ID ? "" : task.id,
    specTaskSourceItemId: task.sourceItemId || "",
    specTaskName: task.title || "",
    specTaskQuantity: Math.max(1, Number(task.quantity || 1)),
    bomListId: task.bomListId || "",
    boardsPerPanel: task.type === "bom" ? normalizeBoardsPerPanel(task.boardsPerPanel, 1) : 1,
	    workCenterId: template.workCenterId,
	    operationName: template.operationName || getWorkCenter(template.workCenterId)?.name || "Операция",
	    stepOrder,
	    isRequired: true,
	    quantityMultiplier: Math.max(1, Number(task.quantity || 1)),
	    unitsPerHour: Number(template.unitsPerHour || getWorkCenterUnitsPerHour(template.workCenterId) || 0),
	    resourceId: template.resourceId || "",
	    calculationType: template.calculationType || getDefaultOperationCalculationType(template.workCenterId, template),
	    secondsPerPanel: Number(template.secondsPerPanel || 0),
	    setupMin: Number(template.setupMin || 0),
	    updatedAt: stamp,
	  };
	}

function getSpecificationRouteTasks(specification, context = {}) {
  if (!specification) return [];
  const visitedSpecificationIds = new Set(context.visitedSpecificationIds || []);
  if (visitedSpecificationIds.has(specification.id)) return [];
  visitedSpecificationIds.add(specification.id);

  const tasks = [];
  getSpekiStructureTableRows(specification).forEach(({ item, number, level }) => {
    const executionType = item.executionType || (item.type === "nomenclature" || item.type === "part" ? "buy" : "make");
    if (executionType !== "make") return;

    if (item.type === "specification" && item.specificationId) {
      const linkedSpecification = getSpecificationById(item.specificationId);
      const nestedTasks = getSpecificationRouteTasks(linkedSpecification, {
        visitedSpecificationIds,
        numberPrefix: context.numberPrefix ? `${context.numberPrefix}.${number}` : number,
        levelOffset: Number(context.levelOffset || 0) + level + 1,
        parentTitle: getSpekiStructureItemLabel(item),
      });
      if (nestedTasks.length) {
        tasks.push(...nestedTasks);
        return;
      }
    }

    const title = getSpekiStructureItemLabel(item);
    const bomId = getSpecificationItemBomId(item);
    const taskType = bomId ? "bom" : item.type;
    const operationName = item.operationName || getDefaultSpekiOperationName(taskType, "make") || "Операция";
    const task = {
      id: context.numberPrefix ? `spec-item:${specification.id}:${item.id}` : `spec-item:${item.id}`,
      sourceItemId: item.id,
      sourceSpecificationId: specification.id,
      parentTitle: context.parentTitle || "",
      number: context.numberPrefix ? `${context.numberPrefix}.${number}` : number,
      level: Number(context.levelOffset || 0) + level,
      type: taskType,
      title,
      operationName,
      departmentName: item.departmentName || getDefaultSpekiDepartmentName(operationName) || "Подразделение не выбрано",
      quantity: Math.max(1, Number(item.quantity || 1)),
      unit: item.unit || "шт.",
      bomListId: bomId,
      boardsPerPanel: getSpecificationItemBoardsPerPanel(item),
    };
    tasks.push({
      ...task,
      workCenterId: getWorkCenterIdForRouteTask(task),
    });
  });

  return tasks;
}

function getRouteMainTask(route = null) {
  return {
    id: MAIN_ROUTE_TASK_ID,
    sourceItemId: "",
    number: "00",
    level: 0,
    type: "route",
    title: "Общий маршрут спецификации",
    operationName: "Финальная последовательность",
    departmentName: "Заказ на пр-во",
    quantity: 1,
    unit: "маршрут",
    workCenterId: getPlanningWorkCenters({ includeWarehouse: false })[0]?.id || "manual",
    isMain: true,
    routeId: route?.id || "",
  };
}

function getRouteTasksForModule(route) {
  const specification = getRouteSpecification(route);
  const specTasks = getSpecificationRouteTasks(specification);
  const steps = route ? getRouteStepsForModule(route.id) : [];
  const taskIds = new Set(specTasks.map((task) => task.id));
  const hasMainSteps = steps.some((step) => getRouteStepTaskId(step) === MAIN_ROUTE_TASK_ID);
  const orphanTasks = [...new Set(steps.map((step) => getRouteStepTaskId(step)))]
    .filter((taskId) => taskId !== MAIN_ROUTE_TASK_ID && !taskIds.has(taskId))
    .map((taskId) => {
      const step = steps.find((item) => getRouteStepTaskId(item) === taskId);
      return {
        id: taskId,
        sourceItemId: "",
        number: "??",
        level: 0,
        type: "orphan",
        title: step?.specTaskName || "Задача больше не найдена в спецификации",
        operationName: "Проверьте структуру спецификации",
        departmentName: "Связь потеряна",
        quantity: 1,
        unit: "задача",
        workCenterId: step?.workCenterId || "manual",
        isOrphan: true,
      };
    });

  return [
    ...(hasMainSteps || !specTasks.length ? [getRouteMainTask(route)] : []),
    ...specTasks,
    ...orphanTasks,
  ];
}

function getSchedulableRouteSteps(routeId) {
  const steps = getRouteStepsForModule(routeId).filter((step) => step.isRequired);
  const taskSteps = steps.filter((step) => getRouteStepTaskId(step) !== MAIN_ROUTE_TASK_ID);
  return (taskSteps.length ? taskSteps : steps)
    .sort((left, right) => (
      getRouteStepTaskId(left).localeCompare(getRouteStepTaskId(right), "ru")
      || Number(left.stepOrder || 0) - Number(right.stepOrder || 0)
    ));
}

function getSchedulableProjectRouteSteps(projectId) {
  const route = getProjectRouteForModule(projectId);
  return route ? getSchedulableRouteSteps(route.id) : [];
}

function ensureRouteTaskSeedSteps(routeId, specification) {
  if (!routeId || !specification) return false;
  const tasks = getSpecificationRouteTasks(specification);
  if (!tasks.length) return false;
  const route = (planningState.routes || []).find((item) => item.id === routeId) || null;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  let changed = false;

  const existingTaskIds = new Set((planningState.routeSteps || [])
    .filter((step) => step.routeId === routeId)
    .map((step) => getRouteStepTaskId(step)));
  planningState.routeSteps = (planningState.routeSteps || []).map((step) => {
    if (step.routeId !== routeId) return step;
    const task = taskById.get(getRouteStepTaskId(step));
    if (!task) return step;
	    const boardsPerPanel = task.type === "bom"
	      ? getPlanningBoardsPerPanel(route, task.sourceItemId || task.id, task.boardsPerPanel || step.boardsPerPanel || 1)
	      : 1;
	    const nextQuantity = Math.max(1, Number(task.quantity || 1));
	    const normalizedStep = normalizeRouteStepCalculationFields({
	      ...step,
	      boardsPerPanel,
	      bomListId: task.bomListId || step.bomListId || "",
	    }, planningState);
	    const patch = {
	      specTaskSourceItemId: task.sourceItemId || step.specTaskSourceItemId || "",
	      specTaskName: task.title || step.specTaskName || "",
	      specTaskQuantity: nextQuantity,
	      quantityMultiplier: nextQuantity,
	      bomListId: task.bomListId || step.bomListId || "",
	      boardsPerPanel,
	      resourceId: step.resourceId || normalizedStep.resourceId || "",
	      calculationType: normalizedStep.calculationType,
	      secondsPerPanel: Number(step.secondsPerPanel || normalizedStep.secondsPerPanel || 0),
	      setupMin: Number(step.setupMin ?? normalizedStep.setupMin ?? 0),
	      unitsPerHour: Number(step.unitsPerHour || normalizedStep.unitsPerHour || 0),
	    };
    const needsPatch = Object.entries(patch).some(([key, value]) => String(step[key] ?? "") !== String(value ?? ""));
    if (!needsPatch) return step;
    changed = true;
    return { ...step, ...patch, updatedAt: new Date().toISOString() };
  });
  const stamp = new Date().toISOString();
  const additions = tasks.flatMap((task) => {
    if (existingTaskIds.has(task.id)) return [];
    const routeTask = task.type === "bom"
      ? { ...task, boardsPerPanel: getPlanningBoardsPerPanel(route, task.sourceItemId || task.id, task.boardsPerPanel || 1) }
      : task;
    return getRouteTaskTemplateSteps(task)
      .map((template, index) => createRouteStepFromTaskTemplate(routeId, routeTask, template, index + 1, stamp));
  });

  if (!additions.length) return changed;
  planningState.routeSteps = [...planningState.routeSteps, ...additions];
  tasks.forEach((task) => normalizeRouteStepOrders(routeId, task.id));
  return true;
}

function getProjectRouteForModule(projectId) {
  return (planningState.routes || []).find((route) => (route.specificationId === projectId || route.projectId === projectId) && route.isDefault)
    || (planningState.routes || []).find((route) => route.specificationId === projectId || route.projectId === projectId)
    || null;
}

function getSpecificationRouteForModule(specificationId) {
  return (planningState.routes || []).find((route) => (route.specificationId === specificationId || route.projectId === specificationId) && route.isDefault)
    || (planningState.routes || []).find((route) => route.specificationId === specificationId || route.projectId === specificationId)
    || null;
}

function getActiveRouteForModule() {
  if (ui.activeRouteId === "__new__") return null;
  if (!ui.activeRouteId) return null;
  const routes = getRoutesForModule();
  return routes.find((route) => route.id === ui.activeRouteId)
    || null;
}

function getRouteModuleStats(route) {
  if (!route) {
    return { steps: [], required: 0, slots: [], warnings: [], hours: 0 };
  }
  const steps = getRouteStepsForModule(route.id);
  const stepIds = new Set(steps.map((step) => step.id));
  const slots = planningState.slots.filter((slot) => stepIds.has(slot.routeStepId));
  const warnings = getSlotWarnings(planningState).warnings.filter((warning) => warning.projectId === route.projectId);
  const hours = Math.round(slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0) * 10) / 10;
  return {
    steps,
    required: steps.filter((step) => step.isRequired).length,
    slots,
    warnings,
    hours,
  };
}

function getRouteDeleteUsage(routeId) {
  const steps = getRouteStepsForModule(routeId);
  const stepIds = new Set(steps.map((step) => step.id));
  const batches = (planningState.batches || []).filter((batch) => batch.routeId === routeId);
  const batchIds = new Set(batches.map((batch) => batch.id));
  const slots = (planningState.slots || []).filter((slot) => (
    stepIds.has(slot.routeStepId) || batchIds.has(slot.batchId)
  ));
  return {
    steps,
    stepIds,
    batches,
    batchIds,
    slots,
    stepsCount: steps.length,
    batchesCount: batches.length,
    slotsCount: slots.length,
  };
}

function deleteRouteMapConfirmed(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  if (!route) return;

  const usage = getRouteDeleteUsage(routeId);
  const routeTargetIds = new Set([route.specificationId, route.projectId].filter(Boolean));
  const wasDefault = Boolean(route.isDefault);

  planningState.routes = (planningState.routes || []).filter((item) => item.id !== routeId);
  planningState.routeSteps = (planningState.routeSteps || []).filter((step) => step.routeId !== routeId);
  planningState.batches = (planningState.batches || []).filter((batch) => !usage.batchIds.has(batch.id));
  planningState.slots = (planningState.slots || []).filter((slot) => (
    !usage.stepIds.has(slot.routeStepId) && !usage.batchIds.has(slot.batchId)
  ));

  if (wasDefault && routeTargetIds.size) {
    const sameTargetRoutes = planningState.routes.filter((item) => (
      routeTargetIds.has(item.specificationId) || routeTargetIds.has(item.projectId)
    ));
    if (sameTargetRoutes.length && !sameTargetRoutes.some((item) => item.isDefault)) {
      const fallbackRoute = sameTargetRoutes[0];
      planningState.routes = planningState.routes.map((item) => (
        item.id === fallbackRoute.id ? { ...item, isDefault: true, updatedAt: new Date().toISOString() } : item
      ));
    }
  }

  planningState = normalizePlanningState(planningState);
  const remainingRoutes = getRoutesForModule();
  ui.activeRouteId = remainingRoutes[0]?.id || "";
  if (planningState.slots.every((slot) => slot.id !== ui.selectedSlotId)) ui.selectedSlotId = null;
  withPlanningEntityRemovalAllowed(() => persistState());
  persistUiState();
  render();
}

function ensureProjectBatches(project) {
  if (!project) return [];
  const existing = planningState.batches.filter((batch) => batch.projectId === project.id);
  if (existing.length) return existing;

  const stamp = new Date().toISOString();
  const batch = {
    id: `b-${project.id}-1`,
    projectId: project.id,
    batchNumber: "1",
    quantity: normalizeQuantity(project.totalQuantity),
    status: project.status || "planned",
    createdAt: stamp,
    updatedAt: stamp,
  };
  planningState.batches = [...planningState.batches, batch];
  return [batch];
}

function ensureRouteBatches(route, production = null) {
  if (!route) return [];
  const context = production || getProject(route.specificationId || route.projectId);
  if (!context) return [];
  const existing = getRoutePlanningBatches(route, context);
  if (existing.length) return existing;

  const stamp = new Date().toISOString();
  const batch = {
    id: `b-${route.id}-1`,
    routeId: route.id,
    specificationId: context.id,
    projectId: context.id,
    batchNumber: "1",
    quantity: normalizeQuantity(route.planningQuantity || context.totalQuantity),
    status: context.status || "planned",
    createdAt: stamp,
    updatedAt: stamp,
  };
  planningState.batches = [...planningState.batches, batch];
  return [batch];
}

function comparePlanningBatches(left, right) {
  return String(left.batchNumber || left.id || "").localeCompare(String(right.batchNumber || right.id || ""), "ru", {
    numeric: true,
    sensitivity: "base",
  });
}

function getRoutePlanningBatches(route, production = null) {
  if (!route) return [];
  const context = production || getProject(route.specificationId || route.projectId);
  const routeId = route.id;
  const productionId = context?.id || route.specificationId || route.projectId || "";
  return (planningState.batches || [])
    .filter((batch) => (
      batch.routeId === routeId
      || (productionId && (batch.specificationId === productionId || batch.projectId === productionId))
    ))
    .sort(comparePlanningBatches);
}

function getPlanningBatchSlots(batch, route = null) {
  if (!batch?.id) return [];
  return (planningState.slots || []).filter((slot) => (
    slot.batchId === batch.id
    && (!route || slot.routeId === route.id || slot.specificationId === route.specificationId || slot.projectId === route.projectId)
  ));
}

function getPlanningBatchQuantityTotal(batches) {
  return (batches || []).reduce((sum, batch) => sum + normalizeQuantity(batch.quantity || 0), 0);
}

function getNextPlanningBatchNumber(batches) {
  const numeric = (batches || [])
    .map((batch) => Number(String(batch.batchNumber || "").split(".")[0]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return String((numeric.length ? Math.max(...numeric) : (batches || []).length) + 1);
}

function getPlanningRouteQuantity(route) {
  if (!route) return 1;
  const project = getProject(route.specificationId || route.projectId);
  const specification = getRouteSpecification(route);
  const batches = getRoutePlanningBatches(route, project);
  const firstBatch = batches[0];
  return normalizeOptionalPositiveInteger(route.planningQuantity)
    || normalizeOptionalPositiveInteger(specification?.productionQuantity)
    || normalizeOptionalPositiveInteger(firstBatch?.quantity)
    || normalizeOptionalPositiveInteger(project?.totalQuantity)
    || 1;
}

function syncPlanningRouteQuantity(routeId, value, options = {}) {
  const quantity = normalizeOptionalPositiveInteger(value);
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const production = getProject(route?.specificationId || route?.projectId);
  if (!route || !production || !quantity) return false;

  const stamp = new Date().toISOString();
  planningState.routes = planningState.routes.map((item) => item.id === route.id ? {
    ...item,
    planningQuantity: quantity,
    updatedAt: stamp,
  } : item);

  const specification = getRouteSpecification(route);
  if (specification?.id) {
    directoryState.specifications = (directoryState.specifications || []).map((item) => item.id === specification.id ? {
      ...item,
      productionQuantity: quantity,
      updatedAt: stamp,
    } : item);
  }

  const batches = getRoutePlanningBatches(route, production);
  const targetBatch = batches[0];
  if (targetBatch && batches.length <= 1) {
    planningState.batches = planningState.batches.map((batch) => batch.id === targetBatch.id ? {
      ...batch,
      routeId: route.id,
      specificationId: production.id,
      projectId: production.id,
      quantity,
      updatedAt: stamp,
    } : batch);
  } else if (!targetBatch) {
    planningState.batches = [...planningState.batches, {
      id: `b-${route.id}-1`,
      routeId: route.id,
      specificationId: production.id,
      projectId: production.id,
      batchNumber: "1",
      quantity,
      status: production.status || "planned",
      createdAt: stamp,
      updatedAt: stamp,
    }];
  }

  if (options.updateSlots) {
    const routeSteps = getSchedulableRouteSteps(route.id);
    const stepById = byId(routeSteps);
    const batchById = byId(getRoutePlanningBatches(route, production));
    planningState.slots = planningState.slots.map((slot) => {
      const step = stepById[slot.routeStepId];
      const batch = batchById[slot.batchId];
      if ((slot.routeId && slot.routeId !== route.id) || !batch || !step || slot.locked || slot.status === "completed") return slot;
      const nextQuantity = getRouteStepQuantityForBatch(step, batch);
      return recalculateSlotEndByQuantity({
        ...slot,
        routeId: route.id,
        specificationId: production.id,
        projectId: production.id,
        quantity: nextQuantity,
        updatedAt: stamp,
      }, planningState);
    });
  }

  if (options.persist !== false) {
    persistState();
    persistDirectoryState();
  }
  if (options.notify !== false) {
    notifySaveSuccess(options.message || "Количество к производству сохранено");
  }
  if (options.render !== false) render();
  return true;
}

function createPlanningBatch(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const production = getProject(route?.specificationId || route?.projectId);
  if (!route || !production) return;

  const stamp = new Date().toISOString();
  const batches = getRoutePlanningBatches(route, production);
  const planningQuantity = getPlanningRouteQuantity(route);
  const batchTotal = getPlanningBatchQuantityTotal(batches);
  const quantity = batches.length
    ? Math.max(1, planningQuantity - batchTotal || Math.ceil(planningQuantity / (batches.length + 1)))
    : planningQuantity;
  const batch = {
    id: makeId("b"),
    routeId: route.id,
    specificationId: production.id,
    projectId: production.id,
    batchNumber: getNextPlanningBatchNumber(batches),
    quantity,
    status: production.status || "planned",
    createdAt: stamp,
    updatedAt: stamp,
  };
  planningState.batches = [...planningState.batches, batch];
  persistState();
  notifySaveSuccess("Партия создана");
  render();
}

function recalculatePlanningBatchSlots(batchId, routeId, stamp = new Date().toISOString()) {
  const route = (planningState.routes || []).find((item) => item.id === routeId)
    || (planningState.routes || []).find((item) => item.id === getBatch(batchId)?.routeId);
  if (!route) return;
  const batch = getBatch(batchId);
  if (!batch) return;
  const stepById = byId(getSchedulableRouteSteps(route.id));
  planningState.slots = (planningState.slots || []).map((slot) => {
    const step = stepById[slot.routeStepId];
    if (slot.batchId !== batch.id || !step || slot.locked || slot.status === "completed") return slot;
    return recalculateSlotEndByQuantity({
      ...slot,
      routeId: route.id,
      specificationId: batch.specificationId || route.specificationId || slot.specificationId || slot.projectId,
      projectId: batch.specificationId || route.specificationId || slot.projectId,
      quantity: getRouteStepQuantityForBatch(step, batch),
      updatedAt: stamp,
    }, planningState);
  });
}

function updatePlanningBatchField(batchId, field, value) {
  const batch = getBatch(batchId);
  if (!batch || !["batchNumber", "quantity"].includes(field)) return;
  const route = (planningState.routes || []).find((item) => item.id === batch.routeId)
    || (planningState.routes || []).find((item) => item.specificationId === batch.specificationId || item.projectId === batch.projectId);
  const production = getProject(route?.specificationId || route?.projectId || batch.specificationId || batch.projectId);
  const stamp = new Date().toISOString();
  let nextValue = value;

  if (field === "batchNumber") {
    nextValue = String(value || "").trim();
    if (!nextValue) return;
  }

  if (field === "quantity") {
    nextValue = normalizeOptionalPositiveInteger(value);
    if (!nextValue) return;
  }

  planningState.batches = (planningState.batches || []).map((item) => item.id === batch.id ? {
    ...item,
    routeId: route?.id || item.routeId || "",
    specificationId: production?.id || item.specificationId || item.projectId || "",
    projectId: production?.id || item.projectId || item.specificationId || "",
    [field]: nextValue,
    updatedAt: stamp,
  } : item);

  if (field === "quantity") {
    recalculatePlanningBatchSlots(batch.id, route?.id || "", stamp);
  }

  persistState();
  notifySaveSuccess("Партия сохранена");
  render();
}

function distributePlanningBatchesEvenly(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const production = getProject(route?.specificationId || route?.projectId);
  if (!route || !production) return;

  let batches = getRoutePlanningBatches(route, production);
  if (!batches.length) {
    ensureRouteBatches(route, production);
    batches = getRoutePlanningBatches(route, production);
  }
  const quantity = getPlanningRouteQuantity(route);
  const base = Math.floor(quantity / batches.length);
  let remainder = quantity % batches.length;
  const stamp = new Date().toISOString();
  planningState.batches = (planningState.batches || []).map((batch) => {
    if (!batches.some((item) => item.id === batch.id)) return batch;
    const nextQuantity = Math.max(1, base + (remainder > 0 ? 1 : 0));
    remainder -= 1;
    return {
      ...batch,
      routeId: route.id,
      specificationId: production.id,
      projectId: production.id,
      quantity: nextQuantity,
      updatedAt: stamp,
    };
  });
  batches.forEach((batch) => recalculatePlanningBatchSlots(batch.id, route.id, stamp));
  persistState();
  notifySaveSuccess("Партии распределены");
  render();
}

function acceptPlanningBatchTotal(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const production = getProject(route?.specificationId || route?.projectId);
  if (!route || !production) return;
  const batches = getRoutePlanningBatches(route, production);
  const total = getPlanningBatchQuantityTotal(batches);
  if (!total) return;
  syncPlanningRouteQuantity(route.id, total, { updateSlots: true, message: "Количество принято из партий" });
}

function requestDeletePlanningBatch(batchId) {
  const batch = getBatch(batchId);
  if (!batch) return;
  const slotsCount = getPlanningBatchSlots(batch).length;
  if (slotsCount) {
    openConfirmDialog("planningDeleteBatch", { batchId });
    return;
  }
  deletePlanningBatch(batchId, { deleteSlots: false });
}

function deletePlanningBatch(batchId, options = {}) {
  const batch = getBatch(batchId);
  if (!batch) return;
  planningState.batches = (planningState.batches || []).filter((item) => item.id !== batch.id);
  if (options.deleteSlots) {
    planningState.slots = (planningState.slots || []).filter((slot) => slot.batchId !== batch.id);
    if (planningState.slots.every((slot) => slot.id !== ui.selectedSlotId)) ui.selectedSlotId = null;
  }
  persistState();
  notifySaveSuccess("Операции маршрута добавлены");
  render();
}

function getPlanningBoardsPerPanelOverrides(route) {
  return route?.planningBoardsPerPanelBySource && typeof route.planningBoardsPerPanelBySource === "object"
    ? route.planningBoardsPerPanelBySource
    : {};
}

function getPlanningBoardsPerPanel(route, sourceId, fallback = 1) {
  const key = String(sourceId || "");
  const overrides = getPlanningBoardsPerPanelOverrides(route);
  if (key && Object.prototype.hasOwnProperty.call(overrides, key)) {
    return normalizeBoardsPerPanel(overrides[key], fallback);
  }
  return normalizeBoardsPerPanel(fallback, 1);
}

function syncPlanningBoardsPerPanel(routeId, sourceId, value, options = {}) {
  const boardsPerPanel = normalizeOptionalPositiveInteger(value);
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const sourceKey = String(sourceId || "");
  if (!route || !sourceKey || !boardsPerPanel) return false;

  const stamp = new Date().toISOString();
  planningState.routes = (planningState.routes || []).map((item) => (
    item.id === route.id
      ? {
          ...item,
          planningBoardsPerPanelBySource: {
            ...getPlanningBoardsPerPanelOverrides(item),
            [sourceKey]: boardsPerPanel,
          },
          updatedAt: stamp,
        }
      : item
  ));

  const affectedStepIds = new Set();
  planningState.routeSteps = (planningState.routeSteps || []).map((step) => {
    if (step.routeId !== route.id) return step;
    const taskId = getRouteStepTaskId(step);
    const compositeKey = `${taskId}:${step.bomListId || ""}`;
    const matchesSource = (
      step.specTaskSourceItemId === sourceKey
      || taskId === sourceKey
      || compositeKey === sourceKey
    );
    if (!matchesSource) return step;
    affectedStepIds.add(step.id);
    return {
      ...step,
      boardsPerPanel,
      updatedAt: stamp,
    };
  });

  if (affectedStepIds.size) {
    planningState.slots = (planningState.slots || []).map((slot) => {
      if (!affectedStepIds.has(slot.routeStepId) || slot.locked || slot.status === "completed") return slot;
      return recalculateSlotEndByQuantity({
        ...slot,
        boardsPerPanel,
        updatedAt: stamp,
      }, planningState);
    });
  }

  if (options.persist !== false) persistState();
  if (options.notify !== false) {
    notifySaveSuccess("Платы в мультиплате сохранены");
  }
  if (options.render !== false) render();
  return true;
}

function getRouteStepQuantityForBatch(routeStep, batch) {
  const multiplier = Math.max(1, Number(routeStep?.quantityMultiplier || routeStep?.specTaskQuantity || 1));
  return Math.max(1, Math.round(normalizeQuantity(batch?.quantity) * multiplier));
}

function getPlanningMultiplicationRows(route, steps = null, planningQuantity = null) {
  if (!route) return [];
  const quantity = normalizeQuantity(planningQuantity || getPlanningRouteQuantity(route));
  const specification = getRouteSpecification(route);
  const bomEntries = specification ? getSpecificationBomEntries(specification.id) : [];
  if (bomEntries.length) {
    return bomEntries.map((entry) => {
      const boards = Math.max(1, Math.round(quantity * Math.max(1, Number(entry.quantity || 1))));
      const sourceId = entry.structureItemId || entry.bom.id;
      const boardsPerPanel = getPlanningBoardsPerPanel(route, sourceId, entry.boardsPerPanel || 1);
      return {
        id: sourceId,
        sourceId,
        label: entry.bom.resultItem || entry.bom.name || "Печатная плата",
        boards,
        boardsPerPanel,
        panels: Math.max(1, Math.ceil(boards / boardsPerPanel)),
      };
    });
  }

  const routeSteps = steps || getSchedulableRouteSteps(route.id);
  const seen = new Set();
  return routeSteps
    .filter((step) => step.bomListId)
    .map((step) => {
      const key = `${getRouteStepTaskId(step)}:${step.bomListId}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const bom = getBomList(step.bomListId);
      const boards = getRouteStepQuantityForBatch(step, { quantity });
      const boardsPerPanel = getPlanningBoardsPerPanel(route, key, getRouteStepBoardsPerPanel(step));
      return {
        id: key,
        sourceId: key,
        label: bom?.resultItem || bom?.name || step.specTaskName || step.operationName || "Печатная плата",
        boards,
        boardsPerPanel,
        panels: Math.max(1, Math.ceil(boards / boardsPerPanel)),
      };
    })
    .filter(Boolean);
}

function getPlanningRouteTransferSummary(route) {
  if (!route) return { batches: [], steps: [], expected: 0, planned: 0, missing: 0, firstStart: null, multiplicationRows: [], totalPanels: 0, batchQuantityTotal: 0, quantityDelta: 0 };
  const project = getProject(route.specificationId || route.projectId);
  const planningQuantity = getPlanningRouteQuantity(route);
  const existingBatches = project ? getRoutePlanningBatches(route, project) : [];
  const batches = existingBatches.length ? existingBatches : project ? [{
    id: "__pending__",
    routeId: route.id,
    specificationId: project.id,
    projectId: project.id,
    batchNumber: "1",
    quantity: planningQuantity,
  }] : [];
  const realBatches = batches.filter((batch) => batch.id !== "__pending__");
  const batchQuantityTotal = realBatches.length ? getPlanningBatchQuantityTotal(realBatches) : planningQuantity;
  const steps = getSchedulableRouteSteps(route.id);
  const stepIds = new Set(steps.map((step) => step.id));
  const batchIds = new Set(batches.map((batch) => batch.id));
  const slots = planningState.slots.filter((slot) => (
    (slot.routeId === route.id || slot.specificationId === project?.id || slot.projectId === project?.id)
    && batchIds.has(slot.batchId)
    && stepIds.has(slot.routeStepId)
  ));
  const expected = batches.length * steps.length;
  const firstStart = slots
    .map((slot) => toDate(slot.plannedStart))
    .sort((left, right) => left - right)[0] || null;
  const multiplicationRows = getPlanningMultiplicationRows(route, steps, batchQuantityTotal || planningQuantity);

  return {
    batches,
    steps,
    planningQuantity,
    batchQuantityTotal,
    quantityDelta: batchQuantityTotal - planningQuantity,
    multiplicationRows,
    totalPanels: multiplicationRows.reduce((sum, row) => sum + row.panels, 0),
    expected,
    planned: slots.length,
    missing: Math.max(0, expected - slots.length),
    firstStart,
  };
}

function getPlanningScheduleAnchorStart() {
  const now = snapDate(new Date(), getGanttSnapMs());
  const windowStart = toDate(fromDateInput(ui.windowStart));
  return now > windowStart ? now : windowStart;
}

function createSlotFromRouteStep(project, batch, routeStep, window, quantity, stamp) {
  const route = (planningState.routes || []).find((item) => item.id === routeStep.routeId);
  const specificationId = route?.specificationId || project.specificationId || project.id;
  return {
    id: makeId("s"),
    routeId: route?.id || routeStep.routeId || "",
    specificationId,
    projectId: specificationId,
    batchId: batch.id,
    workCenterId: routeStep.workCenterId,
    routeStepId: routeStep.id,
    operationName: routeStep.operationName || getWorkCenter(routeStep.workCenterId)?.name || "Операция",
    quantity,
	    unitsPerHour: Number(routeStep.unitsPerHour || 0) || undefined,
	    boardsPerPanel: getRouteStepBoardsPerPanel(routeStep),
	    resourceId: routeStep.resourceId || "",
	    calculationType: routeStep.calculationType || getDefaultOperationCalculationType(routeStep.workCenterId, routeStep),
	    secondsPerPanel: Number(routeStep.secondsPerPanel || 0),
	    setupMin: Number(routeStep.setupMin || 0),
	    bomListId: routeStep.bomListId || "",
	    plannedStart: toSlotDateTime(window.start),
    plannedEnd: toSlotDateTime(window.end),
    actualStart: "",
    actualEnd: "",
    status: "planned",
    comment: "Передано из модуля «Заказ на пр-во».",
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function scheduleRouteBatchOptimally(project, batch, routeSteps, anchorStart, stamp) {
  const groups = [...routeSteps.reduce((map, step) => {
    const taskId = getRouteStepTaskId(step);
    if (!map.has(taskId)) map.set(taskId, []);
    map.get(taskId).push(step);
    return map;
  }, new Map()).entries()].map(([taskId, steps]) => {
    const orderedSteps = [...steps].sort((left, right) => Number(left.stepOrder || 0) - Number(right.stepOrder || 0));
    let readyAt = toDate(anchorStart);
    let foundMissing = false;
    const queue = [];

    orderedSteps.forEach((step) => {
      const existingSlot = planningState.slots.find((slot) => (
        slot.projectId === project.id
        && slot.batchId === batch.id
        && slot.routeStepId === step.id
      ));
      if (!existingSlot) {
        foundMissing = true;
        queue.push(step);
        return;
      }
      if (!foundMissing) {
        readyAt = new Date(Math.max(readyAt.getTime(), addMs(existingSlot.plannedEnd, getRouteBufferMs()).getTime()));
      }
    });

    return { taskId, queue, readyAt };
  });

  const createdIds = [];
  let guard = 0;
  while (groups.some((group) => group.queue.length) && guard < 500) {
    guard += 1;
    const candidates = groups
      .filter((group) => group.queue.length)
      .map((group) => {
        const step = group.queue[0];
        const quantity = getRouteStepQuantityForBatch(step, batch);
        const durationMs = calculateRequiredDurationMs(step.workCenterId, quantity, planningState, step.unitsPerHour || null, step.boardsPerPanel || null, step);
        const window = findFreeWindow(step.workCenterId, durationMs, group.readyAt, null, step.resourceId || "");
        return { group, step, quantity, window };
      })
      .sort((left, right) => (
        toDate(left.window.start) - toDate(right.window.start)
        || toDate(left.window.end) - toDate(right.window.end)
      ));
    const selected = candidates[0];
    if (!selected) break;

    const slot = createSlotFromRouteStep(project, batch, selected.step, selected.window, selected.quantity, stamp);
    planningState.slots = [...planningState.slots, slot];
    createdIds.push(slot.id);
    selected.group.queue.shift();
    selected.group.readyAt = addMs(slot.plannedEnd, getRouteBufferMs());
  }

  return createdIds;
}

function schedulePlanningRouteToGantt(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  const project = getProject(route?.specificationId || route?.projectId);
  if (!route || !project) {
    alert("Не удалось передать маршрут в Гант: маршрутная карта не связана со спецификацией в производстве.");
    return;
  }

  const specification = getRouteSpecification(route);
  if (specification) ensureRouteTaskSeedSteps(route.id, specification);
  const planningQuantity = getPlanningRouteQuantity(route);
  syncPlanningRouteQuantity(route.id, planningQuantity, { updateSlots: true, persist: false, render: false, notify: false });
  const routeSteps = getSchedulableRouteSteps(route.id);
  const batches = ensureRouteBatches(route, project);
  if (!routeSteps.length || !batches.length) {
    alert("Не удалось передать маршрут в Гант: нет операций или партий для размещения.");
    return;
  }

  const stamp = new Date().toISOString();
  const anchorStart = getPlanningScheduleAnchorStart();
  const createdIds = batches.flatMap((batch) => scheduleRouteBatchOptimally(project, batch, routeSteps, anchorStart, stamp));
  planningState = normalizePlanningState(planningState);
  ui.activeModule = "gantt";
  ui.activeProjectId = project.id;
  ui.activeRouteId = route.id;
  ui.expandedProjects.add(route.id);
  if (createdIds.length) ui.selectedSlotId = createdIds[0];
  persistState();
  persistUiState();
  notifySaveSuccess(createdIds.length ? "Маршрут передан в Гант" : "Маршрут уже был в Ганте");
  focusRoute(route.id);
  if (!createdIds.length) {
    alert("Все операции этой маршрутной карты уже находятся в Ганте.");
  }
}

function openPlanningForProject(projectId = "") {
  const project = getProject(projectId) || getProductionContextForSpecification(getActiveSpecificationForModule());
  const route = project ? getProjectRouteForModule(project.id) : null;
  ui.activeModule = "planning";
  ui.activeProjectId = project?.id || ui.activeProjectId || "";
  ui.activeRouteId = route?.id || ui.activeRouteId || "";
  ui.selectedSlotId = null;
  ui.editor = null;
  persistUiState();
  render();
}

function openPlanningForRoute(routeId = "") {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  if (!route) {
    openPlanningForProject(ui.activeProjectId || "");
    return;
  }
  ui.activeModule = "planning";
  ui.activeProjectId = route.specificationId || route.projectId || ui.activeProjectId || "";
  ui.activeRouteId = route.id;
  ui.selectedSlotId = null;
  ui.editor = null;
  persistUiState();
  render();
}

function renderRoutesPage() {
  const activeRoute = getActiveRouteForModule();
  const isNewRoute = ui.activeRouteId === "__new__";
  const hasPreviewRoute = isNewRoute || Boolean(activeRoute);
  const activeSpecification = getActiveSpecificationForModule();
  const defaultProjectId = activeRoute?.specificationId || activeRoute?.projectId || activeSpecification?.id || ui.activeProjectId || "";
  const route = activeRoute || {
    id: "",
    specificationId: defaultProjectId,
    projectId: defaultProjectId,
    name: "Новая маршрутная карта",
    isDefault: Boolean(activeRoute?.isDefault),
  };
  const routeSelectionValue = hasPreviewRoute && isNewRoute && activeSpecification
    ? activeSpecification.id
    : hasPreviewRoute
      ? getRouteModuleSelectionValue(route, activeSpecification)
      : "";
  const routeSpecification = hasPreviewRoute ? getSpecificationById(routeSelectionValue) || getRouteSpecification(route) : null;
  const project = hasPreviewRoute ? getProject(routeSelectionValue || route.specificationId || route.projectId) : null;
  const routeTargetName = hasPreviewRoute
    ? routeSpecification?.name || getProjectDisplayName(project) || "выберите спецификацию"
    : "выберите карту слева";
  const canOpenRouteTarget = Boolean(hasPreviewRoute);
  const stats = getRouteModuleStats(activeRoute);
  const specificationOptions = (directoryState.specifications || [])
    .map((item) => ({
      value: item.id,
      label: item.name || "Спецификация без названия",
      meta: `${getSpecificationProductionOrder(item) || "заказ не задан"} · ${PROJECT_STATUS_LABELS[getSpecificationProductionStatus(item)] || "статус"}`,
    }));

  return `
    <section class="routes-page module-data-page" data-layout="main-content" aria-label="Маршрутные карты">
      <aside class="directory-sidebar module-data-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Технология</span>
          <h1>Маршрутная карта</h1>
        </div>
        <div class="module-sidebar-actions">
          <button class="primary-button" data-route-create type="button">${icon("plus")}<span>Новая карта</span></button>
        </div>
        <div class="module-entity-list">
          <div class="module-list-label">Маршрутные карты спецификаций</div>
          ${isNewRoute ? `<button class="module-entity-item is-active" type="button"><span><strong>Новая маршрутная карта</strong><small>${escapeHtml(routeTargetName)}</small></span><em>new</em></button>` : ""}
          ${getRoutesForModule().map((item) => {
            const routeProject = getProject(item.projectId);
            const itemSpecification = getRouteSpecification(item);
            const steps = getRouteStepsForModule(item.id);
            return `
              <button class="module-entity-item ${item.id === activeRoute?.id ? "is-active" : ""}" data-route-open="${item.id}" type="button">
                <span>
                  <strong>${escapeHtml(item.name || "Маршрутная карта")}</strong>
                  <small>${escapeHtml(itemSpecification?.name || getProjectDisplayName(routeProject) || "спецификация не найдена")} · ${steps.length} шагов</small>
                </span>
                <em>${steps.length}</em>
              </button>
            `;
          }).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Маршрутная карта</span>
            <h2>${escapeHtml(hasPreviewRoute ? (isNewRoute ? "Новая маршрутная карта" : route.name || "Маршрутная карта") : "Карта не выбрана")}</h2>
            <p>${escapeHtml(hasPreviewRoute ? (routeSpecification || project ? `${routeTargetName}: последовательность подразделений и нормативов для передачи в Гант.` : "Выберите спецификацию и задайте последовательность операций.") : "Выберите маршрутную карту в перечне или создайте новую.")}</p>
          </div>
          <div class="directory-actions">
            <button class="primary-button" data-route-to-planning type="button" ${canOpenRouteTarget ? "" : "disabled"}>${icon("calendar")}<span>В Заказ на пр-во</span></button>
          </div>
        </header>

        <div class="module-data-content route-module-content">
          ${hasPreviewRoute ? `
          <section class="module-panel route-editor-panel">
            <div class="report-card-head">
              <strong>Карточка маршрута</strong>
              <span>${isNewRoute ? "создание технологической карты" : "спецификация, статус и применение в плане"}</span>
            </div>
            <form id="routeModuleForm" class="module-form route-module-form">
              <input type="hidden" name="routeId" value="${escapeAttribute(route.id)}" />
              <input type="hidden" name="isNew" value="${isNewRoute ? "yes" : "no"}" />
              <input type="hidden" name="routeBindingId" value="${escapeAttribute(routeSelectionValue)}" />
              <label class="form-field full"><span>Название маршрутной карты</span><input name="name" value="${escapeAttribute(route.name || "")}" placeholder="Основной маршрут" /></label>
              <label class="form-field full">
                <span>Спецификация</span>
                ${renderDenseInlineSelect("routeBindingId", routeSelectionValue, specificationOptions, { type: "routeModule" })}
              </label>
              <div class="module-form-actions full">
                <button class="primary-button" type="submit">${icon("save")}<span>${isNewRoute ? "Создать карту" : "Сохранить карту"}</span></button>
                ${isNewRoute ? "" : `<button class="secondary-button danger" data-route-delete="${escapeAttribute(route.id)}" type="button">${icon("trash")}<span>Удалить карту</span></button>`}
              </div>
            </form>
          </section>

          <section class="module-panel route-steps-panel">
            <div class="report-card-head">
              <strong>Операции маршрута</strong>
              <div class="route-steps-head-actions">
                <span>Добавляйте только операции подразделения или склада.</span>
                <button class="secondary-button" data-route-add-step="workCenter" type="button">${icon("plus")}<span>Подразделение</span></button>
                <button class="secondary-button" data-route-add-step="warehouse" type="button">${icon("package")}<span>Склад</span></button>
              </div>
            </div>
            ${renderRouteStepsEditor(activeRoute, stats.steps)}
          </section>
          ` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderRouteModuleSequence(steps, route = null) {
  if (!steps.length) {
    return `
      <div class="route-module-empty">
        ${icon("split")}
        <strong>Маршрут пока пустой</strong>
        <span>Добавьте операции в нужной последовательности. Конечный складской шаг можно оставить последним.</span>
      </div>
    `;
  }

  const tasks = getRouteTasksForModule(route);
  if (tasks.length > 1 || tasks.some((task) => !task.isMain)) {
    return `
      <div class="route-task-sequence" aria-label="Последовательность маршрутной карты по задачам">
        ${tasks.map((task) => {
          const taskSteps = getRouteStepsForTask(steps, task.id);
          return `
            <article class="route-task-sequence-card ${task.isMain ? "is-main-task" : ""} ${task.isOrphan ? "is-orphan-task" : ""}">
              <header>
                <span>${escapeHtml(task.number)} · ${escapeHtml(getRouteTaskTypeLabel(task))}</span>
                <strong>${escapeHtml(task.title)}</strong>
                <small>${escapeHtml(task.quantity)} ${escapeHtml(task.unit)} · ${escapeHtml(task.departmentName)}</small>
              </header>
              ${taskSteps.length ? `
                <div class="route-task-sequence-steps">
                  ${taskSteps.map((step) => {
                    const center = getWorkCenter(step.workCenterId);
                    return `<span class="${step.workCenterId === "warehouse" ? "is-warehouse" : ""}"><b>${Number(step.stepOrder || 0)}</b>${escapeHtml(step.operationName || "Операция")}<small>${escapeHtml(center?.name || step.workCenterId || "подразделение")}</small></span>`;
                  }).join("")}
                </div>
              ` : `<div class="route-task-sequence-empty">Операции еще не заданы</div>`}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  return `
    <div class="route-module-sequence" aria-label="Последовательность маршрутной карты">
      ${steps.map((step) => {
        const center = getWorkCenter(step.workCenterId);
        return `
          <article class="${step.workCenterId === "warehouse" ? "is-warehouse" : ""}">
            <b>${Number(step.stepOrder || 0)}</b>
            <span><strong>${escapeHtml(step.operationName || "Операция")}</strong><small>${escapeHtml(center?.name || step.workCenterId || "подразделение")}</small></span>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function getRouteTaskTypeLabel(task) {
  if (task?.isMain) return "общий";
  if (task?.isOrphan) return "проверить";
  if (task?.type === "bom") return "плата";
  if (task?.type === "specification") return "спецификация";
  if (task?.type === "assembly") return "узел";
  if (task?.type === "nomenclature" || task?.type === "part") return "позиция";
  return "задача";
}

function renderRouteStepsEditor(route, steps) {
  if (!route) {
    return `
      <div class="route-module-empty">
        ${icon("info")}
        <strong>Карта еще не сохранена</strong>
        <span>Сохраните карточку маршрута, чтобы открыть редактирование операций.</span>
      </div>
    `;
  }

  const workCenterOptions = getPlanningWorkCenters().map((center) => ({
    value: center.id,
    label: center.name,
    meta: center.code || "подразделение",
  }));
  const orderedSteps = getRouteStepsForModule(route.id);

  return `
    <div class="route-step-editor-shell">
      ${orderedSteps.length ? renderRouteStepRows(orderedSteps, workCenterOptions) : `
        <div class="route-module-empty">
          ${icon("info")}
          <strong>Операций пока нет</strong>
          <span>Добавьте операцию подразделения или склада кнопками в заголовке блока.</span>
        </div>
      `}
    </div>
  `;
}

function renderRouteStepRows(steps, workCenterOptions) {
  return `
    <div class="route-step-editor-list">
      ${steps.map((step, index) => {
        const operationOptions = getRouteStepOperationOptions(step);
        const operationValue = getRouteStepOperationSelectValue(step, operationOptions);
        return `
          <article class="route-step-editor-row ${step.workCenterId === "warehouse" ? "is-warehouse" : ""}" data-route-step-row="${step.id}">
            <div class="route-step-index">
              <button class="icon-button" data-route-step-up="${step.id}" type="button" title="Поднять" ${index === 0 ? "disabled" : ""}>${icon("chevronUp")}</button>
              <span class="route-step-order-badge" title="Позиция в общем списке операций" aria-label="Позиция в общем списке операций">${index + 1}</span>
              <button class="icon-button" data-route-step-down="${step.id}" type="button" title="Опустить" ${index === steps.length - 1 ? "disabled" : ""}>${icon("chevronDown")}</button>
            </div>
            <label class="form-field route-step-center">
              <span>Подразделение</span>
              ${renderDenseInlineSelect("workCenterId", step.workCenterId, workCenterOptions, { type: "routeStep", stepId: step.id })}
            </label>
            <label class="form-field route-step-name">
              <span>Операция</span>
              ${renderDenseInlineSelect("operationId", operationValue, operationOptions, { type: "routeStep", stepId: step.id })}
            </label>
            <button class="icon-button danger-soft" data-route-step-delete="${step.id}" type="button" title="Удалить операцию">${icon("trash")}</button>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function getRouteStepOperationSelectValue(step, options = getRouteStepOperationOptions(step)) {
  if (step.operationId && options.some((item) => item.value === step.operationId)) return step.operationId;
  if (step.operationName) return `legacy:${step.id}`;
  return options[0]?.value || "";
}

function getRouteStepOperationOptions(step = {}) {
  const operations = getOperationMapRows().map((operation) => {
    const center = getWorkCenter(operation.workCenterId);
    const type = getOperationTypeOption(operation.type);
    return {
      value: operation.id,
      label: operation.name || "Операция без названия",
      meta: `${type.label} · ${center?.name || "подразделение не выбрано"}`,
    };
  });
  const hasLinkedOperation = step.operationId && operations.some((item) => item.value === step.operationId);
  const hasNameMatch = operations.some((item) => normalizeLookupText(item.label) === normalizeLookupText(step.operationName));
  if (step.operationName && (!hasLinkedOperation || !hasNameMatch)) {
    operations.unshift({
      value: `legacy:${step.id}`,
      label: step.operationName,
      meta: "текстовая операция",
    });
  }
  if (!step.operationId && !step.operationName) {
    operations.unshift({
      value: "",
      label: "Операция не выбрана",
      meta: "выберите из карты операций",
    });
  }
  if (!operations.length) {
    operations.push({
      value: "",
      label: "Операция не выбрана",
      meta: "создайте операцию в карте операций",
    });
  }
  return operations;
}

function renderDirectoryPage() {
  const visibleSections = getVisibleDirectorySections();
  const visibleGroups = getVisibleDirectoryGroups(visibleSections);
  const activeSection = visibleSections.find((section) => section.id === ui.activeDirectory) || visibleSections[0];
  if (activeSection && activeSection.id !== ui.activeDirectory) ui.activeDirectory = activeSection.id;
  const directoryData = getDirectoryData(activeSection.id);

  return `
    <section class="directories-page" data-layout="main-content" aria-label="Справочники MES">
      <aside class="directory-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Мастер-данные</span>
          <h1>Справочники</h1>
        </div>
        <div class="directory-nav">
          ${visibleGroups.map((group) => `
            <section class="directory-nav-group">
              <div class="directory-nav-group-head">
                <span>${escapeHtml(group.label)}</span>
              </div>
              <div class="directory-nav-group-items">
                ${group.sections.map((section) => `
                  <button class="directory-nav-item ${section.id === activeSection.id ? "is-active" : ""}" data-directory-id="${section.id}" type="button">
                    <span>
                      <strong>${escapeHtml(section.label)}</strong>
                    </span>
                    <em>${section.count()}</em>
                  </button>
                `).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      </aside>

      <div class="directory-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Справочник</span>
            <h2>${escapeHtml(activeSection.label)}</h2>
            <p>${escapeHtml(activeSection.description)}</p>
          </div>
          <div class="directory-actions">
            <label class="field search-field directory-search">
              ${icon("search")}
              <input type="search" placeholder="Поиск по справочнику" />
            </label>
            <button class="secondary-button" data-directory-refresh type="button">${icon("refresh")}<span>Обновить</span></button>
            <button class="secondary-button danger" data-delete-directory-selected type="button" ${directoryData.rows.length ? "" : "disabled"}>${icon("trash")}<span>Удалить выбранное</span></button>
            <button class="primary-button" data-add-directory type="button">${icon("plus")}<span>Добавить запись</span></button>
          </div>
        </header>

        <div class="directory-content">
          ${activeSection.id === "employees" ? renderEmployeeDepartmentConstructor() : ""}
          <section class="directory-table-card">
            ${renderDirectoryTable(directoryData)}
          </section>
          <aside class="directory-detail-card">
            ${renderDirectoryDetail(activeSection, directoryData)}
          </aside>
        </div>
      </div>
      ${renderDirectoryEditorModal(activeSection, directoryData)}
    </section>
  `;
}

function startUpdateNotifier() {
  if (updateCheckTimer) return;
  window.setTimeout(checkForAppUpdate, 2500);
  updateCheckTimer = window.setInterval(checkForAppUpdate, UPDATE_CHECK_INTERVAL_MS);
}

async function checkForAppUpdate() {
  try {
    const sourceUrl = new URL("./src/app.js", window.location.href);
    sourceUrl.searchParams.set("version-check", String(Date.now()));
    const response = await fetch(sourceUrl.toString(), {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return;
    const source = await response.text();
    const latestVersion = extractAppVersion(source);
    if (!latestVersion || latestVersion === APP_VERSION) return;
    if (localStorage.getItem(UPDATE_DISMISSED_STORAGE_KEY) === latestVersion) return;
    showUpdateReadyNotice(latestVersion);
  } catch (error) {
    // Local file previews can block fetch; the notifier is optional there.
  }
}

function extractAppVersion(source) {
  const match = String(source || "").match(/const\s+APP_VERSION\s*=\s*["']([^"']+)["']/);
  return match?.[1] || "";
}

function showUpdateReadyNotice(version) {
  if (!version || updateNoticeVersion === version) return;
  updateNoticeVersion = version;
  document.querySelector("[data-update-ready-notice]")?.remove();
  const notice = document.createElement("section");
  notice.className = "update-ready-notice";
  notice.setAttribute("data-update-ready-notice", version);
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.innerHTML = `
    <div class="update-ready-icon">${icon("refresh")}</div>
    <div class="update-ready-copy">
      <strong>Обновление готово</strong>
      <span>Открыта ${escapeHtml(APP_VERSION)}, доступна ${escapeHtml(version)}. Обновите страницу, чтобы увидеть последнюю доработку.</span>
    </div>
    <div class="update-ready-actions">
      <button class="primary-button" data-update-reload="${escapeAttribute(version)}" type="button">${icon("refresh")}<span>Обновить</span></button>
      <button class="secondary-button" data-update-dismiss="${escapeAttribute(version)}" type="button">Позже</button>
    </div>
  `;
  document.body.appendChild(notice);
}

function hideUpdateReadyNotice(version) {
  document.querySelector("[data-update-ready-notice]")?.remove();
  if (version) localStorage.setItem(UPDATE_DISMISSED_STORAGE_KEY, version);
  updateNoticeVersion = "";
}

function reloadForLatestUpdate(version) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("cache-reset", `update-${String(version || APP_VERSION).replace(/[^a-z0-9.-]/gi, "")}-${Date.now()}`);
  window.location.href = nextUrl.toString();
}

function renderConfirmModal() {
  if (!ui.confirmDialog) return "";
  const config = getConfirmDialogConfig(ui.confirmDialog);

  return `
    <div class="modal-backdrop confirm-backdrop" data-confirm-cancel>
      <section class="modal confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeAttribute(config.title)}">
        <div class="modal-header">
          <div>
            <span class="eyebrow">MOD · Confirm Compact</span>
            <h2>${escapeHtml(config.title)}</h2>
          </div>
          <button class="icon-button" data-confirm-cancel type="button" title="Закрыть">${icon("close")}</button>
        </div>
        <div class="confirm-body ${config.tone || ""}">
          <div class="confirm-icon">${icon(config.icon || "alert")}</div>
          <div>
            <p>${escapeHtml(config.body)}</p>
            ${config.meta ? `<span>${escapeHtml(config.meta)}</span>` : ""}
          </div>
        </div>
        <div class="modal-footer">
          <button class="secondary-button" data-confirm-cancel type="button">Отмена</button>
          <button class="primary-button ${config.tone === "danger" ? "danger-primary" : ""}" data-confirm-approve type="button">${icon(config.confirmIcon || "check")}<span>${escapeHtml(config.confirmLabel)}</span></button>
        </div>
      </section>
    </div>
  `;
}

function getConfirmDialogConfig(dialog) {
  const payload = dialog?.payload || {};

  if (dialog?.action === "resetDemo") {
    return {
      title: "Сбросить прототип?",
      body: "Все демо-данные планирования будут пересозданы. Текущие изменения в плане, слотах и статусах будут потеряны.",
      meta: "Действие влияет на модуль планирования и связанные отчеты.",
      confirmLabel: "Сбросить",
      confirmIcon: "reset",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "deleteSlot") {
    const slot = planningState.slots.find((item) => item.id === payload.slotId);
    return {
      title: "Удалить операцию?",
      body: `Слот "${slot?.operationName || "операция"}" будет удален из диаграммы планирования.`,
      meta: "Это изменит план спецификации и пересчитает отчеты.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "planningDeleteBatch") {
    const batch = getBatch(payload.batchId);
    const slotsCount = getPlanningBatchSlots(batch).length;
    return {
      title: "Удалить партию?",
      body: `Партия ${batch?.batchNumber || ""} будет удалена из планирования${slotsCount ? ` вместе с ${slotsCount} слотами Ганта` : ""}.`,
      meta: "Это изменит партийность маршрутной карты и может убрать операции из Ганта.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "spekiDeleteSpecification") {
    const specification = (directoryState.specifications || []).find((item) => item.id === payload.specificationId);
    const usage = getSpecificationDeleteUsage(payload.specificationId);
    return {
      title: "Удалить спецификацию?",
      body: `Спецификация "${specification?.name || "без названия"}" будет удалена из перечня и больше не будет доступна в конструкторе.`,
      meta: `Ссылки в других спецификациях будут очищены. Также будет удалено: ${usage.routesCount} маршрутных карт, ${usage.batchesCount} партий, ${usage.slotsCount} слотов Ганта.`,
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "bomDeleteList") {
    const bom = getBomList(payload.bomId);
    const linkedSpecifications = getBomLinkedSpecifications(payload.bomId);
    const rowsCount = getBomImportRows(bom).length;
    return {
      title: "Удалить BOM-лист?",
      body: `BOM "${bom?.name || "без названия"}" будет удален вместе с импортированной таблицей${rowsCount ? ` на ${rowsCount} строк` : ""}.`,
      meta: linkedSpecifications.length
        ? `BOM используется в ${linkedSpecifications.length} спецификациях. Ссылки на него будут очищены.`
        : "Связанных спецификаций не найдено.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "directoryDeleteRow") {
    const directoryData = getDirectoryData(payload.sectionId || ui.activeDirectory);
    const row = directoryData.rows[Number(payload.rowIndex)];
    return {
      title: "Удалить запись справочника?",
      body: `Запись "${getDirectoryRowLabel(directoryData.sectionId, row) || "без названия"}" будет удалена из раздела "${getDirectorySectionLabel(directoryData.sectionId)}".`,
      meta: "Если запись используется в связанных данных, система очистит прямые ссылки или оставит предупреждения в рабочих модулях.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "nomenclatureDeleteItem") {
    const item = getNomenclatureItem(payload.itemId);
    const usage = getNomenclatureDeleteUsage(payload.itemId);
    return {
      title: "Удалить позицию номенклатуры?",
      body: `Позиция "${item?.name || "без названия"}" будет удалена из номенклатуры.`,
      meta: `Ссылки будут очищены: ${usage.specificationsCount} спецификаций, ${usage.bomRowsCount} строк BOM.`,
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "operationMapDelete") {
    const operation = getOperationMapItem(payload.operationId);
    const usageCount = planningState.routeSteps.filter((step) => step.operationId === payload.operationId).length;
    return {
      title: "Удалить операцию?",
      body: `Операция "${operation?.name || "без названия"}" будет удалена из карты операций.`,
      meta: usageCount ? `В ${usageCount} шагах маршрутов связь будет очищена, текст операции останется.` : "Связанных маршрутных карт не найдено.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "cascadeSlot") {
    const slot = planningState.slots.find((item) => item.id === payload.slotId);
    return {
      title: "Пересчитать цепочку?",
      body: `Операции после "${slot?.operationName || "выбранного слота"}" будут сдвинуты по маршруту партии.`,
      meta: "Действие влияет на Гант, предупреждения и отчеты.",
      confirmLabel: "Пересчитать",
      confirmIcon: "refresh",
      icon: "refresh",
      tone: "warning",
    };
  }

  if (dialog?.action === "fixAllWarnings") {
    const warnings = getSlotWarnings(planningState).warnings;
    const critical = warnings.filter((warning) => warning.severity === "critical").length;
    return {
      title: "Исправить конфликты плана?",
      body: `Система попробует автоматически исправить ${warnings.length} предупреждений, включая ${critical} критичных: сдвиги, пересечения, подразделения и количество.`,
      meta: "Зафиксированные и завершенные операции не будут изменены.",
      confirmLabel: "Исправить",
      confirmIcon: "refresh",
      icon: "alert",
      tone: critical ? "danger" : "warning",
    };
  }

  if (dialog?.action === "calculatorResetRoute") {
    return {
      title: "Сбросить маршрут?",
      body: "Маршрутная карта калькулятора будет возвращена к шаблону спецификации. Выбранная спецификация и BOM останутся.",
      meta: "Используй это, если нужно заново собрать последовательность операций.",
      confirmLabel: "Сбросить",
      confirmIcon: "reset",
      icon: "alert",
      tone: "warning",
    };
  }

  if (dialog?.action === "calculatorDeleteOperation") {
    const operation = getRouteOperations().find((item) => item.id === payload.operationId);
    return {
      title: "Удалить операцию маршрута?",
      body: `Шаг "${operation?.operationName || "операция"}" будет удален из маршрутной карты калькулятора.`,
      meta: "После сохранения маршрута это может изменить маршрут спецификации.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "calculatorSaveRoute") {
    const calc = calculateComplexityResult();
    return {
      title: "Сохранить маршрут спецификации?",
      body: `Маршрутная карта спецификации "${calc.specification?.name || getProjectDisplayName(calc.project) || "спецификация"}" будет обновлена по расчету калькулятора.`,
      meta: "Действие влияет на справочник маршрутов и будущую постановку операций на Гант.",
      confirmLabel: "Сохранить",
      confirmIcon: "save",
      icon: "info",
      tone: "info",
    };
  }

  if (dialog?.action === "routeDeleteStep") {
    const step = planningState.routeSteps.find((item) => item.id === payload.stepId);
    const slotsCount = planningState.slots.filter((slot) => slot.routeStepId === payload.stepId).length;
    return {
      title: "Удалить шаг маршрута?",
      body: `Операция "${step?.operationName || "шаг маршрута"}" будет удалена из маршрутной карты.`,
      meta: slotsCount ? `Этот шаг используют ${slotsCount} операций Ганта. После удаления они получат предупреждение маршрута.` : "Действие изменит технологическую последовательность спецификации.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "routeDeleteMap") {
    const route = (planningState.routes || []).find((item) => item.id === payload.routeId);
    const usage = getRouteDeleteUsage(payload.routeId);
    return {
      title: "Удалить маршрутную карту?",
      body: `Маршрутная карта "${route?.name || "без названия"}" будет удалена из модуля.`,
      meta: `Также будет удалено: ${usage.stepsCount} операций маршрута, ${usage.batchesCount} партий, ${usage.slotsCount} слотов Ганта.`,
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  return {
    title: "Подтвердить действие?",
    body: "Это действие изменит данные прототипа.",
    confirmLabel: "Подтвердить",
    confirmIcon: "check",
    icon: "info",
    tone: "info",
  };
}

function buildWorkloadRows() {
  const rows = getPlanningWorkCenters().map((center, index) => {
    const slots = planningState.slots.filter((slot) => slot.workCenterId === center.id);
    return {
      label: center.name,
      code: center.code,
      count: slots.length,
      hours: Math.round(slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0) * 10) / 10,
      quantity: slots.reduce((sum, slot) => sum + Number(slot.quantity || 0), 0),
      color: center.id === "warehouse" ? "#16a34a" : chartColors[index % chartColors.length],
    };
  }).filter((row) => row.count || row.label === "Склад")
    .sort((left, right) => right.hours - left.hours);
  const maxHours = Math.max(1, ...rows.map((row) => row.hours));
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  return rows.map((row) => ({
    ...row,
    percentHours: Math.round(row.hours / maxHours * 100),
    percentCount: Math.round(row.count / maxCount * 100),
  }));
}

function buildDeadlineRows() {
  return getProductionContexts()
    .sort((left, right) => toDate(left.dueDate) - toDate(right.dueDate))
    .map((project, index) => {
      const progress = calculateProjectProgress(project, planningState);
      return {
        project: getProjectDisplayName(project) || project.name,
        order: getSpecificationProductionOrder(getSpecificationByProjectId(project.id)) || project.orderNumber,
        quantity: `${Number(project.totalQuantity || 0).toLocaleString("ru-RU")} шт.`,
        due: formatDate(project.dueDate),
        status: PROJECT_STATUS_LABELS[project.status],
        progress,
        color: progress >= 70 ? "#16a34a" : progress >= 35 ? "#2563eb" : chartColors[index % chartColors.length],
      };
    });
}

function buildSlotStatusItems(slots) {
  const counts = SLOT_STATUSES.map((status) => ({
    label: STATUS_LABELS[status],
    value: slots.filter((slot) => slot.status === status).length,
    color: statusReportColors[status],
  })).filter((item) => item.value > 0);
  return counts.length ? counts : [{ label: "Нет данных", value: 1, color: "#cbd5e1" }];
}

function buildProjectStatusItems() {
  const productionContexts = getProductionContexts();
  return PROJECT_STATUSES.map((status) => ({
    label: PROJECT_STATUS_LABELS[status],
    value: productionContexts.filter((project) => project.status === status).length,
    color: statusReportColors[status] || "#64748b",
  })).filter((item) => item.value > 0);
}

function buildWarningTypeItems(warnings) {
  const types = [
    { type: "capacity", label: "Загрузка", color: "#dc2626" },
    { type: "route", label: "Маршрут", color: "#d97706" },
    { type: "quantity", label: "Количество", color: "#0284c7" },
    { type: "duration", label: "Длительность", color: "#7c3aed" },
  ];
  const items = types.map((item) => ({
    ...item,
    value: warnings.filter((warning) => warning.type === item.type).length,
  })).filter((item) => item.value > 0);
  return items.length ? items : [{ label: "Нет предупреждений", value: 1, color: "#16a34a" }];
}

function buildWarningProjectItems(warnings) {
  const counts = getProductionContexts().map((project, index) => {
    const value = warnings.filter((warning) => warning.projectId === project.id).length;
    return {
      label: getProjectDisplayName(project) || project.name,
      value: String(value),
      percent: 0,
      rawValue: value,
      color: value ? chartColors[index % chartColors.length] : "#cbd5e1",
    };
  });
  const maxValue = Math.max(1, ...counts.map((item) => item.rawValue));
  return counts.map((item) => ({ ...item, percent: Math.round(item.rawValue / maxValue * 100) }));
}

function buildWarehouseProjectItems(warehouseSlots) {
  const rows = getProductionContexts().map((project, index) => {
    const quantity = warehouseSlots
      .filter((slot) => slot.projectId === project.id)
      .reduce((sum, slot) => sum + Number(slot.quantity || 0), 0);
    return {
      label: getProjectDisplayName(project) || project.name,
      rawValue: quantity,
      value: `${quantity} шт.`,
      color: index === 0 ? "#16a34a" : chartColors[index % chartColors.length],
    };
  }).filter((row) => row.rawValue > 0);
  const maxValue = Math.max(1, ...rows.map((row) => row.rawValue));
  return rows.map((row) => ({ ...row, percent: Math.round(row.rawValue / maxValue * 100) }));
}

function buildWarningRows(warnings) {
  return warnings.slice(0, 10).map((warning) => [
    warning.type,
    warning.severity === "critical" ? "Критично" : "Предупреждение",
    getProjectDisplayName(getProject(warning.projectId)) || "-",
    warning.message,
  ]);
}

function buildWorkloadInsights(workload, warnings) {
  const top = workload[0];
  return [
    { icon: "info", text: top ? `Самое загруженное подразделение: ${top.label}, ${top.hours} ч.` : "Нет операций для анализа загрузки." },
    { icon: warnings.some((warning) => warning.type === "capacity") ? "alert" : "check", tone: warnings.some((warning) => warning.type === "capacity") ? "warning" : "ok", text: warnings.some((warning) => warning.type === "capacity") ? "Есть пересечения операций по емкости подразделений." : "Пересечений по емкости не найдено." },
    { icon: "check", tone: "ok", text: "Склад учитывается как отдельное конечное подразделение." },
  ];
}

function buildDeadlineInsights(deadlineRows) {
  const risky = deadlineRows.filter((row) => !row.status.includes("Заверш") && row.progress < 40);
  return [
    { icon: risky.length ? "alert" : "check", tone: risky.length ? "warning" : "ok", text: risky.length ? `${risky.length} спецификации имеют низкую готовность.` : "Спецификации выглядят устойчиво по готовности." },
    { icon: "info", text: deadlineRows[0] ? `Ближайший срок: ${deadlineRows[0].project}, ${deadlineRows[0].due}.` : "Нет спецификаций со сроками." },
  ];
}

function buildWarningInsights(warnings) {
  return [
    { icon: warnings.length ? "alert" : "check", tone: warnings.length ? "warning" : "ok", text: warnings.length ? `Всего найдено ${warnings.length} предупреждений.` : "Предупреждений нет." },
    { icon: "info", text: "Критичные сообщения подсвечивают конфликты, которые влияют на выполнимость плана." },
  ];
}

function buildDonutGradient(items) {
  const total = Math.max(1, items.reduce((sum, item) => sum + Number(item.value || 0), 0));
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += Number(item.value || 0) / total * 100;
    return `${item.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function getSlotDurationHours(slot) {
  return Math.max(0, (toDate(slot.plannedEnd) - toDate(slot.plannedStart)) / (60 * 60 * 1000));
}

function formatReportNumber(value) {
  return String(Math.round(Number(value || 0) * 10) / 10);
}

function getEmployeeDepartmentNames() {
  const names = new Set([
    ...(planningState.workCenters || []).map((center) => center.name),
    ...(directoryState.employees || []).map((employee) => employee.department),
  ].filter(Boolean));
  return [...names].sort((left, right) => left.localeCompare(right, "ru"));
}

function renderEmployeeDepartmentConstructor() {
  const departmentNames = getEmployeeDepartmentNames();
  const roles = directoryState.roles || [];
  const employees = directoryState.employees || [];
  const departmentOptions = departmentNames.map((name) => ({ value: name, label: name, meta: `${employees.filter((employee) => employee.department === name).length} сотр.` }));
  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name, meta: role.code || "роль" }));

  return `
    <section class="employee-constructor-card">
      <div class="directory-table-toolbar">
        <strong>Конструктор подразделений</strong>
        <span>перетаскивайте сотрудников между подразделениями, меняйте должность и роль доступа</span>
      </div>
      <div class="employee-department-board">
        ${departmentNames.map((departmentName) => {
          const departmentEmployees = employees.filter((employee) => employee.department === departmentName);
          return `
            <article class="employee-department-column" data-employee-drop-department="${escapeAttribute(departmentName)}">
              <div class="employee-department-head">
                <strong>${escapeHtml(departmentName)}</strong>
                <span>${departmentEmployees.length}</span>
              </div>
              <div class="employee-card-list">
                ${departmentEmployees.length ? departmentEmployees.map((employee) => `
                  <div class="employee-assignment-card" draggable="true" data-employee-drag-id="${employee.id}">
                    <div class="employee-assignment-main">
                      <strong>${escapeHtml(employee.name)}</strong>
                      <small>${escapeHtml(getRoleName(employee.roleId))}</small>
                    </div>
                    <label class="employee-position-field">
                      <span>Должность</span>
                      <input data-employee-inline-field="role" data-employee-id="${employee.id}" type="text" value="${escapeAttribute(employee.role || "")}" />
                    </label>
                    <div class="employee-assignment-controls">
                      <div class="field compact">
                        <span>Подразделение</span>
                        ${renderEmployeeDenseSelect(employee.id, "department", employee.department, departmentOptions)}
                      </div>
                      <div class="field compact">
                        <span>Роль</span>
                        ${renderEmployeeDenseSelect(employee.id, "roleId", employee.roleId, roleOptions)}
                      </div>
                    </div>
                  </div>
                `).join("") : `
                  <div class="employee-drop-empty">Перетащите сотрудника в это подразделение</div>
                `}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderEmployeeDenseSelect(employeeId, field, value, items) {
  const selectedItem = items.find((item) => String(item.value) === String(value))
    || items[0]
    || { value: "", label: "Не выбрано", meta: "" };

  return `
    <details class="dense-inline-select employee-dense-select" data-employee-select="${escapeAttribute(field)}" data-employee-id="${escapeAttribute(employeeId)}">
      <summary>
        <span>
          <strong>${escapeHtml(selectedItem.label)}</strong>
          ${selectedItem.meta ? `<small>${escapeHtml(selectedItem.meta)}</small>` : ""}
        </span>
        ${icon("chevronDown")}
      </summary>
      <div class="dense-inline-options">
        ${items.map((item) => `
          <button class="${String(item.value) === String(value) ? "is-selected" : ""}" data-employee-value="${escapeAttribute(item.value)}" type="button">
            <strong>${escapeHtml(item.label)}</strong>
            ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
          </button>
        `).join("")}
      </div>
    </details>
  `;
}

function renderDirectoryTable(directoryData) {
  return `
    <div class="directory-table-toolbar">
      <strong>${directoryData.rows.length} записей</strong>
      <span>${escapeHtml(directoryData.caption)}</span>
    </div>
    <div class="directory-table-wrap" data-layout="table">
      <table class="directory-table">
        <thead>
          <tr>
            ${directoryData.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
            <th class="actions-cell">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${directoryData.rows.map((row, rowIndex) => `
            <tr class="${getSelectedDirectoryRowIndex(directoryData.sectionId, directoryData.rows) === rowIndex ? "is-selected" : ""}" data-directory-row="${rowIndex}">
              ${directoryData.keys.map((key, index) => `
                <td class="${index === 0 ? "primary-cell" : ""}">${escapeHtml(formatDirectoryCell(directoryData.sectionId, key, row[key]))}</td>
              `).join("")}
              <td class="actions-cell">
                <button class="table-icon-button" data-edit-directory-row="${rowIndex}" type="button" title="Редактировать запись">${icon("edit")}</button>
                <button class="table-icon-button danger-soft" data-delete-directory-row="${rowIndex}" type="button" title="Удалить запись">${icon("trash")}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDirectoryDetail(activeSection, directoryData) {
  const firstRow = directoryData.rows[getSelectedDirectoryRowIndex(activeSection.id, directoryData.rows)];
  const health = getDirectoryHealth(activeSection.id);

  return `
    <div class="detail-card-head">
      <span class="eyebrow">Контекст</span>
      <h3>${escapeHtml(firstRow?.[directoryData.keys[0]] || activeSection.label)}</h3>
    </div>
    <dl class="directory-detail-list">
      ${firstRow ? directoryData.keys.slice(0, 5).map((key, index) => `
        <div>
          <dt>${escapeHtml(directoryData.columns[index])}</dt>
          <dd>${escapeHtml(formatDirectoryCell(activeSection.id, key, firstRow[key]))}</dd>
        </div>
      `).join("") : `
        <div><dt>Состояние</dt><dd>Нет записей</dd></div>
      `}
    </dl>
    <div class="directory-health">
      <div>
        <strong>${health.ready}</strong>
        <span>готово к планированию</span>
      </div>
      <div>
        <strong>${health.review}</strong>
        <span>требует проверки</span>
      </div>
    </div>
  `;
}

function getDirectoryData(sectionId) {
  if (sectionId === "workCenters") {
    return makeDirectoryData(sectionId, {
      caption: "Подразделения объединяют организационную ответственность и производственные мощности. Только производственные подразделения участвуют в Ганте.",
      columns: ["Подразделение", "Код", "Тип", "В плане", "Изд./час", "Емкость", "Смена", "Ответственный", "Описание", "Активность"],
      keys: ["name", "code", "unitType", "planningStatus", "unitsPerHour", "capacity", "shift", "owner", "description", "status"],
      rows: planningState.workCenters.map((center) => ({
        id: center.id,
        name: center.name,
        code: center.code,
        unitType: center.unitType || "production",
        planningStatus: center.isPlanningUnit === false ? "no" : "yes",
        unitsPerHour: center.unitsPerHour,
        capacity: center.capacity,
        shift: center.shift,
        owner: center.owner || "",
        description: center.description || "-",
        status: center.isActive ? "active" : "inactive",
      })),
    });
  }

  if (sectionId === "statuses") {
    return makeDirectoryData(sectionId, {
      caption: "Единые статусы для производственного планирования и мониторинга.",
      columns: ["Статус", "Тип", "Код", "Использование"],
      keys: ["name", "type", "code", "usage"],
      rows: directoryState.statuses,
    });
  }

  const configs = {
    roles: {
      caption: "Роли управляют доступом к модулям, справочникам и действиям пользователя.",
      columns: ["Роль", "Код", "Уровень", "Модули", "Справочники", "Права", "Статус"],
      keys: ["name", "code", "accessLevel", "modules", "directories", "permissions", "status"],
      rows: directoryState.roles,
    },
    productionResources: {
      caption: "Производственные ресурсы объединяют линии, станки, посты и оборудование. В Ганте операции привязываются к ресурсам внутри подразделений.",
      columns: ["Ресурс", "Тип", "Подразделение", "Родитель", "В Ганте", "В расчете", "Мощность", "База комп./ч", "Эфф., %", "Setup, мин", "Инв. номер", "ТО", "Статус"],
      keys: ["name", "type", "workCenterId", "parentResourceId", "participatesInPlanning", "participatesInCalculation", "capacity", "baseCph", "efficiency", "changeoverMin", "inventory", "maintenance", "status"],
      rows: getProductionResources({ includeInactive: true }),
    },
    componentTypes: {
      caption: "Коэффициенты сложности и ограничения скорости для расчета SMT-монтажа.",
      columns: ["Тип", "Корпус", "Семейство", "Коэф.", "Комп./ч", "Setup, сек", "По умолч.", "Статус"],
      keys: ["name", "package", "family", "coefficient", "placementsPerHour", "setupSeconds", "defaultCount", "status"],
      rows: directoryState.componentTypes,
    },
    nomenclatureTypes: {
      caption: "Типы номенклатуры синхронизируются с модулем номенклатуры и используются как разделы списка.",
      columns: ["Тип номенклатуры", "Код", "Описание", "Статус"],
      keys: ["name", "code", "description", "status"],
      rows: directoryState.nomenclatureTypes,
    },
    employees: {
      caption: "Сотрудники получают роли доступа из справочника ролей и используются для авторизации по ФИО.",
      columns: ["Сотрудник", "Роль доступа", "Должность", "Подразделение", "Смена", "Пароль", "Статус"],
      keys: ["name", "roleId", "role", "department", "shift", "password", "status"],
      rows: directoryState.employees,
    },
    norms: {
      caption: "Нормативы используются для ограничений, смен и будущего автопланирования.",
      columns: ["Норматив", "Значение", "Область", "Статус"],
      keys: ["name", "value", "scope", "status"],
      rows: directoryState.norms,
    },
  };

  return makeDirectoryData(sectionId, configs[sectionId] || getDirectoryData("workCenters"));
}

function makeDirectoryData(sectionId, config) {
  return {
    sectionId,
    fields: config.keys.map((key, index) => ({
      key,
      label: config.columns[index],
      type: getDirectoryFieldType(sectionId, key),
      readonly: isDirectoryFieldReadonly(sectionId, key),
    })),
    ...config,
  };
}

function getDirectoryFieldType(sectionId, key) {
  if (sectionId === "specifications" && (key === "bomListA" || key === "bomListB")) return "bom-link";
  if (sectionId === "employees" && key === "roleId") return "role-link";
  if (sectionId === "employees" && key === "password") return "password";
  if (sectionId === "workCenters" && key === "unitType") return "unit-type";
  if (sectionId === "workCenters" && key === "planningStatus") return "yes-no";
  if (sectionId === "workCenters" && key === "shift") return "work-shift";
  if (sectionId === "productionResources" && key === "type") return "production-resource-type";
  if (sectionId === "productionResources" && key === "workCenterId") return "work-center-link";
  if (sectionId === "productionResources" && key === "parentResourceId") return "production-resource-parent-link";
  if (sectionId === "productionResources" && (key === "participatesInPlanning" || key === "participatesInCalculation")) return "yes-no";
  if (
    key === "totalQuantity"
    || key === "steps"
    || (sectionId === "roles" && key === "accessLevel")
    || key === "unitsPerHour"
    || (sectionId === "workCenters" && key === "capacity")
    || key === "baseCph"
    || key === "efficiency"
    || key === "changeoverMin"
    || key === "coefficient"
    || key === "placementsPerHour"
    || key === "setupSeconds"
    || key === "defaultCount"
    || key === "bomQtyA"
    || key === "bomQtyB"
    || BOM_COMPONENT_FIELDS.some((field) => field.key === key)
  ) return "number";
  if (key === "dueDate") return "date";
  if (key === "status" && sectionId === "workCenters") return "active-status";
  if (key === "default") return "yes-no";
  return "text";
}

function isDirectoryFieldReadonly(sectionId, key) {
  return false;
}

function getSelectedDirectoryRowIndex(sectionId, rows) {
  const index = Number(ui.selectedDirectoryRows?.[sectionId] || 0);
  if (!rows.length) return 0;
  return Math.max(0, Math.min(rows.length - 1, Number.isFinite(index) ? index : 0));
}

function formatDirectoryCell(sectionId, key, value) {
  if (sectionId === "workCenters" && key === "status") return value === "active" ? "Активен" : "Отключен";
  if (sectionId === "workCenters" && key === "unitType") return UNIT_TYPE_LABELS[value] || value || "-";
  if (sectionId === "workCenters" && key === "planningStatus") return value === "yes" ? "Да" : "Нет";
  if (sectionId === "workCenters" && key === "unitsPerHour") return Number(value || 0) ? `${Number(value || 0).toLocaleString("ru-RU")} изд./час` : "-";
  if (sectionId === "workCenters" && key === "capacity") return Number(value || 0) ? `${Number(value || 0).toLocaleString("ru-RU")} паралл.` : "-";
  if (sectionId === "specifications" && (key === "bomListA" || key === "bomListB")) return getBomList(value)?.name || "-";
  if (sectionId === "specifications" && (key === "bomQtyA" || key === "bomQtyB")) return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (sectionId === "bomLists" && BOM_COMPONENT_FIELDS.some((field) => field.key === key)) return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (sectionId === "productionResources" && key === "type") return PRODUCTION_RESOURCE_TYPE_LABELS[value] || value || "-";
  if (sectionId === "productionResources" && key === "workCenterId") return getWorkCenter(value)?.name || value || "-";
  if (sectionId === "productionResources" && key === "parentResourceId") return getProductionResource(value)?.name || "-";
  if (sectionId === "productionResources" && (key === "participatesInPlanning" || key === "participatesInCalculation")) return value === "yes" ? "Да" : "Нет";
  if (sectionId === "productionResources" && key === "baseCph") return Number(value || 0) ? `${Number(value || 0).toLocaleString("ru-RU")} комп./ч` : "-";
  if (sectionId === "productionResources" && key === "efficiency") return Number(value || 0) ? `${Number(value || 0).toLocaleString("ru-RU")} %` : "-";
  if (sectionId === "productionResources" && key === "changeoverMin") return Number(value || 0) ? `${Number(value || 0).toLocaleString("ru-RU")} мин` : "-";
  if (sectionId === "componentTypes" && key === "coefficient") return formatCalculatorNumber(value, 2);
  if (sectionId === "componentTypes" && key === "placementsPerHour") return `${Number(value || 0).toLocaleString("ru-RU")} комп./ч`;
  if (sectionId === "componentTypes" && key === "setupSeconds") return `${Number(value || 0).toLocaleString("ru-RU")} сек`;
  if (sectionId === "componentTypes" && key === "defaultCount") return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (sectionId === "roles" && key === "accessLevel") return `${Number(value || 0).toLocaleString("ru-RU")} / 100`;
  if (sectionId === "employees" && key === "roleId") return getRoleName(value);
  if (sectionId === "employees" && key === "password") return value ? "Задан" : "Пустой";
  if (key === "default") return value === "yes" ? "Да" : "Нет";
  return value ?? "";
}

function getDirectorySectionLabel(sectionId) {
  return directorySections.find((section) => section.id === sectionId)?.label
    || sectionId
    || "Справочник";
}

function getDirectoryRowLabel(sectionId, row) {
  if (!row) return "";
  const data = getDirectoryData(sectionId);
  const primaryKey = data.keys?.[0] || "name";
  return String(row[primaryKey] || row.name || row.operationName || row.code || row.id || "").trim();
}

function renderDirectoryEditorModal(activeSection, directoryData) {
  if (!ui.directoryEditor) return "";
  const isCreate = ui.directoryEditor.mode === "create";
  const rowIndex = isCreate ? -1 : ui.directoryEditor.rowIndex;
  const row = isCreate ? createEmptyDirectoryRow(directoryData) : directoryData.rows[rowIndex];
  if (!row) return "";

  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <section class="modal large-modal form-modal" role="dialog" aria-modal="true" aria-label="Редактирование справочника">
        <form id="directoryForm">
          <div class="modal-header">
            <div>
              <span class="eyebrow">MOD · Form Modal · ${escapeHtml(activeSection.label)}</span>
              <h2>${isCreate ? "Новая запись" : "Редактирование записи"}</h2>
            </div>
            <button class="icon-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
          </div>

          <input type="hidden" name="sectionId" value="${activeSection.id}" />
          <input type="hidden" name="rowIndex" value="${rowIndex}" />
          <input type="hidden" name="rowId" value="${escapeAttribute(row.id || "")}" />

          <div class="form-grid">
            ${directoryData.fields.map((field) => renderDirectoryField(field, row[field.key])).join("")}
          </div>

          <div class="modal-footer">
            ${isCreate ? "" : `<button class="secondary-button danger" data-delete-directory-current type="button">${icon("trash")}<span>Удалить</span></button>`}
            <button class="secondary-button" data-close-modal type="button">Отмена</button>
            <button class="primary-button" type="submit">${icon("save")}<span>Сохранить</span></button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderDirectoryField(field, value) {
  const readonly = field.readonly ? "readonly" : "";
  const readonlyClass = field.readonly ? "readonly" : "";
  const escapedValue = escapeAttribute(value ?? "");

  if (field.type === "active-status") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}">
          <option value="active" ${selected(value, "active")}>Активен</option>
          <option value="inactive" ${selected(value, "inactive")}>Отключен</option>
        </select>
      </label>
    `;
  }

  if (field.type === "yes-no") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          <option value="yes" ${selected(value, "yes")}>Да</option>
          <option value="no" ${selected(value, "no")}>Нет</option>
        </select>
      </label>
    `;
  }

  if (field.type === "unit-type") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${Object.entries(UNIT_TYPE_LABELS).map(([key, label]) => `<option value="${key}" ${selected(value, key)}>${escapeHtml(label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "production-resource-type") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${Object.entries(PRODUCTION_RESOURCE_TYPE_LABELS).map(([key, label]) => `<option value="${key}" ${selected(value, key)}>${escapeHtml(label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "work-center-link") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${getPlanningWorkCenters().map((center) => `<option value="${escapeAttribute(center.id)}" ${selected(value, center.id)}>${escapeHtml(center.name)} · ${escapeHtml(center.code || "")}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "production-resource-parent-link") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          <option value="" ${selected(value, "")}>Нет родителя</option>
          ${getProductionResources({ includeInactive: true }).map((resource) => `<option value="${escapeAttribute(resource.id)}" ${selected(value, resource.id)}>${escapeHtml(resource.name)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "work-shift") {
    const hasCustomValue = value && !WORK_SHIFT_OPTIONS.some((option) => option.value === value);
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${hasCustomValue ? `<option value="${escapedValue}" selected>${escapeHtml(value)}</option>` : ""}
          ${WORK_SHIFT_OPTIONS.map((option) => `<option value="${escapeAttribute(option.value)}" ${selected(value, option.value)}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "project-link") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}">
          ${(directoryState.specifications || []).map((specification) => `<option value="${specification.id}" ${selected(value, specification.id)}>${escapeHtml(specification.name)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "bom-link") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}">
          <option value="" ${selected(value, "")}>Не выбран</option>
          ${(directoryState.bomLists || []).map((bom) => `<option value="${bom.id}" ${selected(value, bom.id)}>${escapeHtml(bom.name)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  if (field.type === "role-link") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}">
          ${(directoryState.roles || []).map((role) => `<option value="${role.id}" ${selected(value, role.id)}>${escapeHtml(role.name)} · ${escapeHtml(role.code || "")}</option>`).join("")}
        </select>
      </label>
    `;
  }

  return `
    <label class="form-field ${readonlyClass}">
      <span>${escapeHtml(field.label)}</span>
      <input name="${field.key}" type="${field.type}" value="${escapedValue}" ${readonly} />
    </label>
  `;
}

function createEmptyDirectoryRow(directoryData) {
  return directoryData.keys.reduce((row, key) => {
    row[key] = "";
    if (key === "status") row[key] = "Активен";
    if (directoryData.sectionId === "workCenters" && key === "status") row[key] = "active";
    if (directoryData.sectionId === "workCenters" && key === "unitType") row[key] = "production";
    if (directoryData.sectionId === "workCenters" && key === "planningStatus") row[key] = "yes";
    if (directoryData.sectionId === "productionResources" && key === "type") row[key] = "workplace";
    if (directoryData.sectionId === "productionResources" && key === "workCenterId") row[key] = getPlanningWorkCenters()[0]?.id || "manual";
    if (directoryData.sectionId === "productionResources" && key === "participatesInPlanning") row[key] = "yes";
    if (directoryData.sectionId === "productionResources" && key === "participatesInCalculation") row[key] = "yes";
    if (key === "totalQuantity" || key === "steps") row[key] = 0;
    if (key === "unitsPerHour") row[key] = 40;
    if (key === "capacity") row[key] = directoryData.sectionId === "workCenters" ? 1 : "1 партия / смена";
    if (key === "accessLevel") row[key] = 10;
    if (key === "baseCph") row[key] = 30000;
    if (key === "efficiency") row[key] = 85;
    if (key === "changeoverMin") row[key] = 15;
    if (key === "coefficient") row[key] = 1;
    if (key === "placementsPerHour") row[key] = 30000;
    if (key === "setupSeconds") row[key] = 15;
    if (key === "defaultCount") row[key] = 0;
    if (BOM_COMPONENT_FIELDS.some((field) => field.key === key)) row[key] = 0;
    if (key === "projectId") row[key] = "";
    if (key === "bomListA") row[key] = directoryState.bomLists?.[0]?.id || "";
    if (key === "bomListB") row[key] = "";
    if (key === "bomQtyA") row[key] = 1;
    if (key === "bomQtyB") row[key] = 0;
    if (key === "shift") row[key] = "5/2 08:00-20:00";
    if (key === "roleId") row[key] = directoryState.roles?.[0]?.id || "role-admin";
    if (key === "password") row[key] = "";
    if (directoryData.sectionId === "roles" && key === "modules") row[key] = "gantt";
    if (directoryData.sectionId === "roles" && key === "directories") row[key] = "statuses";
    if (directoryData.sectionId === "roles" && key === "permissions") row[key] = "read";
    if (key === "default") row[key] = "no";
    if (key === "dueDate") row[key] = toDateInput(addMs(new Date(), 14 * 24 * 60 * 60 * 1000));
    return row;
  }, { id: makeId("dir") });
}

function getDirectoryHealth(sectionId) {
  const rows = getDirectoryData(sectionId).rows;
  const review = rows.filter((row) => Object.values(row).some((value) => String(value).match(/Проверка|Проблема|Отключен/))).length;
  return {
    ready: Math.max(0, rows.length - review),
    review,
  };
}

function bindAuthEvents() {
  const form = app.querySelector("#authForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const authEmployees = (directoryState.employees || []).filter((employee) => employee.status !== "Уволен");
    const employeeSource = authEmployees.length ? authEmployees : [SYSTEM_AUTH_EMPLOYEE];
    const employee = employeeSource.find((item) => item.id === String(data.get("employeeId")));
    const password = String(data.get("password") || "");
    const expectedPassword = String(employee?.password || "");

    if (!employee) {
      alert("Выберите сотрудника для входа.");
      return;
    }

    if (password !== expectedPassword) {
      alert("Пароль не совпадает. Для отладки пароль у всех сотрудников пустой.");
      return;
    }

    authState = {
      employeeId: employee.id,
      loggedInAt: new Date().toISOString(),
    };
    persistAuthState();
    ensureAuthorizedModule();
    render();
  });
}

function bindGlobalNavigation() {
  app.querySelector("[data-auth-logout]")?.addEventListener("click", () => {
    authState = { employeeId: "", loggedInAt: "" };
    persistAuthState();
    render();
  });
}

function navigateToModule(moduleId) {
  if (!getAvailableModules().some((moduleItem) => moduleItem.id === moduleId)) return;
  const previousModule = ui.activeModule;
  ui.activeModule = moduleId;
  ui.selectedSlotId = null;
  ui.editor = null;
  ui.splitSlotId = null;
  ui.projectModal = false;
  ui.confirmDialog = null;
  if (moduleId === "nomenclature" && previousModule !== "nomenclature") {
    ui.activeNomenclatureId = "";
  }
  if (moduleId === "bomLists" && previousModule !== "bomLists") {
    ui.activeBomId = "";
  }
  if (moduleId === "speki" && previousModule !== "speki") {
    ui.activeSpecificationId = "";
    ui.spekiEditingId = "";
    ui.spekiCheckedSpecificationId = "";
    ui.spekiStaleItemIds = [];
  }
  if (moduleId === "routes" && previousModule !== "routes") {
    ui.activeRouteId = "";
  }
  if (moduleId === "planning" && previousModule !== "planning") {
    ui.activeRouteId = "";
  }
  persistUiState();
  render();
}

function openConfirmDialog(action, payload = {}) {
  ui.confirmDialog = { action, payload };
  render();
}

function bindConfirmEvents() {
  app.querySelectorAll("[data-confirm-cancel]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-confirm-cancel]")) return;
      ui.confirmDialog = null;
      render();
    });
  });

  app.querySelector("[data-confirm-approve]")?.addEventListener("click", () => {
    const dialog = ui.confirmDialog;
    ui.confirmDialog = null;
    performConfirmedAction(dialog);
  });
}

function performConfirmedAction(dialog) {
  if (!dialog) return;
  const payload = dialog.payload || {};

  if (dialog.action === "resetDemo") {
    resetDemoState();
    return;
  }

  if (dialog.action === "deleteSlot") {
    deleteSlotConfirmed(payload.slotId);
    return;
  }

  if (dialog.action === "planningDeleteBatch") {
    deletePlanningBatch(payload.batchId, { deleteSlots: true });
    return;
  }

  if (dialog.action === "spekiDeleteSpecification") {
    deleteSpekiSpecification(payload.specificationId);
    return;
  }

  if (dialog.action === "bomDeleteList") {
    deleteBomList(payload.bomId);
    return;
  }

  if (dialog.action === "directoryDeleteRow") {
    deleteDirectoryRow(payload.sectionId, payload.rowIndex);
    return;
  }

  if (dialog.action === "nomenclatureDeleteItem") {
    deleteNomenclatureItem(payload.itemId);
    return;
  }

  if (dialog.action === "operationMapDelete") {
    deleteOperationMapItem(payload.operationId);
    return;
  }

  if (dialog.action === "cascadeSlot") {
    cascadeBatchFromSlot(payload.slotId);
    persistState();
    render();
    return;
  }

  if (dialog.action === "fixAllWarnings") {
    autoFixAllWarnings();
    return;
  }

  if (dialog.action === "calculatorResetRoute") {
    resetCalculatorRoute();
    return;
  }

  if (dialog.action === "calculatorDeleteOperation") {
    deleteSelectedRouteOperation();
    return;
  }

  if (dialog.action === "calculatorSaveRoute") {
    saveCalculatorRouteToProject();
    return;
  }

  if (dialog.action === "routeDeleteStep") {
    deleteRouteStepConfirmed(payload.stepId);
    return;
  }

  if (dialog.action === "routeDeleteMap") {
    deleteRouteMapConfirmed(payload.routeId);
  }
}

function bindDirectoryEvents() {
  app.querySelectorAll("[data-directory-id]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.activeDirectory = button.dataset.directoryId;
      ui.directoryEditor = null;
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-directory-row]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-edit-directory-row], [data-delete-directory-row]")) return;
      ui.selectedDirectoryRows[ui.activeDirectory] = Number(row.dataset.directoryRow);
      persistUiState();
      render();
    });
  });

  app.querySelector("[data-add-directory]")?.addEventListener("click", () => {
    ui.directoryEditor = { mode: "create", sectionId: ui.activeDirectory };
    render();
  });

  app.querySelectorAll("[data-edit-directory-row]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const rowIndex = Number(button.dataset.editDirectoryRow);
      ui.selectedDirectoryRows[ui.activeDirectory] = rowIndex;
      ui.directoryEditor = { mode: "edit", sectionId: ui.activeDirectory, rowIndex };
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-delete-directory-row]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const rowIndex = Number(button.dataset.deleteDirectoryRow);
      ui.selectedDirectoryRows[ui.activeDirectory] = rowIndex;
      openConfirmDialog("directoryDeleteRow", { sectionId: ui.activeDirectory, rowIndex });
    });
  });

  app.querySelector("[data-delete-directory-selected]")?.addEventListener("click", () => {
    const directoryData = getDirectoryData(ui.activeDirectory);
    const rowIndex = getSelectedDirectoryRowIndex(ui.activeDirectory, directoryData.rows);
    if (!directoryData.rows.length) return;
    openConfirmDialog("directoryDeleteRow", { sectionId: ui.activeDirectory, rowIndex });
  });

  app.querySelector("[data-delete-directory-current]")?.addEventListener("click", () => {
    const editor = ui.directoryEditor;
    if (!editor || editor.mode !== "edit") return;
    openConfirmDialog("directoryDeleteRow", { sectionId: editor.sectionId, rowIndex: editor.rowIndex });
  });

  app.querySelector("[data-directory-refresh]")?.addEventListener("click", () => {
    render();
  });

  app.querySelectorAll("[data-close-modal], [data-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-close-modal]")) return;
      ui.directoryEditor = null;
      render();
    });
  });

  bindEmployeeConstructorEvents();
  bindDirectoryForm();
}

function bindEmployeeConstructorEvents() {
  app.querySelectorAll("[data-employee-select] [data-employee-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-employee-select]");
      if (!root) return;
      updateEmployeeDirectoryField(root.dataset.employeeId, root.dataset.employeeSelect, button.dataset.employeeValue || "");
    });
  });

  app.querySelectorAll("[data-employee-inline-field]").forEach((field) => {
    const commit = () => updateEmployeeDirectoryField(field.dataset.employeeId, field.dataset.employeeInlineField, field.value);
    field.addEventListener("change", commit);
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commit();
    });
  });

  app.querySelectorAll("[data-employee-drag-id]").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      card.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", card.dataset.employeeDragId || "");
      event.dataTransfer?.setDragImage(card, 16, 16);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      app.querySelectorAll("[data-employee-drop-department]").forEach((column) => column.classList.remove("is-drop-target"));
    });
  });

  app.querySelectorAll("[data-employee-drop-department]").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("is-drop-target");
    });
    column.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && column.contains(event.relatedTarget)) return;
      column.classList.remove("is-drop-target");
    });
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("is-drop-target");
      const employeeId = event.dataTransfer?.getData("text/plain");
      updateEmployeeDirectoryField(employeeId, "department", column.dataset.employeeDropDepartment || "");
    });
  });
}

function updateEmployeeDirectoryField(employeeId, field, value) {
  if (!employeeId || !field) return;
  const stamp = new Date().toISOString();
  directoryState.employees = (directoryState.employees || []).map((employee) => (
    employee.id === employeeId
      ? { ...employee, [field]: String(value || "").trim(), updatedAt: stamp }
      : employee
  ));
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ensureAuthorizedModule();
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess("Данные сотрудника сохранены");
  render();
}

function bindPlanningEvents() {
  app.querySelectorAll("[data-planning-quantity]").forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
      syncPlanningRouteQuantity(input.dataset.planningQuantity || "", input.value);
    });

    input.addEventListener("change", () => {
      syncPlanningRouteQuantity(input.dataset.planningQuantity || "", input.value);
    });
  });

  app.querySelectorAll("[data-planning-boards-per-panel]").forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
      syncPlanningBoardsPerPanel(
        input.dataset.planningBppRoute || "",
        input.dataset.planningBoardsPerPanel || "",
        input.value,
      );
    });

    input.addEventListener("change", () => {
      syncPlanningBoardsPerPanel(
        input.dataset.planningBppRoute || "",
        input.dataset.planningBoardsPerPanel || "",
        input.value,
      );
    });
  });

  app.querySelectorAll("[data-planning-batch-field]").forEach((input) => {
    const commit = () => updatePlanningBatchField(
      input.dataset.planningBatchId || "",
      input.dataset.planningBatchField || "",
      input.value,
    );
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
      commit();
    });
    input.addEventListener("change", commit);
  });

  app.querySelectorAll("[data-planning-batch-add]").forEach((button) => {
    button.addEventListener("click", () => createPlanningBatch(button.dataset.planningBatchAdd || ""));
  });

  app.querySelectorAll("[data-planning-batches-distribute]").forEach((button) => {
    button.addEventListener("click", () => distributePlanningBatchesEvenly(button.dataset.planningBatchesDistribute || ""));
  });

  app.querySelectorAll("[data-planning-batches-accept-total]").forEach((button) => {
    button.addEventListener("click", () => acceptPlanningBatchTotal(button.dataset.planningBatchesAcceptTotal || ""));
  });

  app.querySelectorAll("[data-planning-batch-delete]").forEach((button) => {
    button.addEventListener("click", () => requestDeletePlanningBatch(button.dataset.planningBatchDelete || ""));
  });

  app.querySelector("[data-planning-route-to-gantt]")?.addEventListener("click", (event) => {
    const routeId = event.currentTarget.dataset.planningRouteToGantt || "";
    schedulePlanningRouteToGantt(routeId);
  });

  app.querySelectorAll("[data-planning-route-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = planningState.routes.find((item) => item.id === button.dataset.planningRouteOpen);
      if (!route) return;
      ui.activeRouteId = route.id;
      ui.activeProjectId = route.projectId;
      ensureRouteTaskSeedSteps(route.id, getRouteSpecification(route));
      persistUiState();
      persistState();
      render();
    });
  });
}

function bindOperationMapEvents() {
  app.querySelector("[data-operation-create]")?.addEventListener("click", () => {
    ui.activeOperationId = "__new__";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-operation-open]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.activeOperationId = button.dataset.operationOpen || "";
      persistUiState();
      render();
    });
  });

  app.querySelector("#operationMapForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveOperationMapForm(event.currentTarget);
  });

  app.querySelectorAll("[data-dense-operation-map-field] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-operation-map-field]");
      const field = root?.dataset.denseOperationMapField || "";
      const form = button.closest("form");
      const hidden = form?.querySelector(`[data-operation-map-hidden="${CSS.escape(field)}"]`);
      if (hidden) hidden.value = button.dataset.denseValue || "";
      updateDenseInlineSelected(root, button);
    });
  });

  app.querySelector("[data-operation-delete]")?.addEventListener("click", (event) => {
    event.preventDefault();
    const operationId = event.currentTarget.dataset.operationDelete || "";
    if (!operationId) return;
    openConfirmDialog("operationMapDelete", { operationId });
  });
}

function updateDenseInlineSelected(root, button) {
  if (!root || !button) return;
  root.querySelectorAll("[data-dense-value]").forEach((item) => {
    item.classList.toggle("is-selected", item === button);
  });
  const summary = root.querySelector("summary span");
  const label = button.querySelector("strong")?.textContent || "Не выбрано";
  const meta = button.querySelector("small")?.textContent || "";
  if (summary) {
    summary.innerHTML = `
      <strong>${escapeHtml(label)}</strong>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
    `;
  }
  root.open = false;
}

function saveOperationMapForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const existing = isNew ? null : getOperationMapItem(String(data.get("operationId") || ""));
  const name = String(data.get("name") || "").trim();
  const workCenterId = String(data.get("workCenterId") || "");
  if (!name || !workCenterId) {
    alert("Заполните название операции и подразделение по умолчанию.");
    return;
  }

  const type = OPERATION_TYPE_OPTIONS.some((item) => item.value === data.get("type"))
    ? String(data.get("type"))
    : "production";
  const stamp = new Date().toISOString();
  const row = normalizeDirectoryRow("operationMap", {
    ...(existing || {}),
    id: existing?.id || makeId("op"),
    name,
    code: String(data.get("code") || "").trim(),
    type,
    workCenterId,
    unitsPerHour: Math.max(0, Math.round(Number(data.get("unitsPerHour") || 0) * 10) / 10),
    requiresBatch: data.get("requiresBatch") === "on",
    isWarehouse: type === "warehouse" || workCenterId === "warehouse",
    status: "Активен",
    updatedAt: stamp,
  });

  directoryState.operationMap = [
    ...(directoryState.operationMap || []).filter((item) => item.id !== row.id),
    row,
  ];
  applyOperationMapChangesToRoutes(row);
  ui.activeOperationId = row.id;
  persistDirectoryState();
  persistState();
  persistUiState();
  notifySaveSuccess(isNew ? "Операция создана" : "Операция сохранена");
  render();
}

function applyOperationMapChangesToRoutes(operation) {
  if (!operation?.id) return;
  planningState.routeSteps = (planningState.routeSteps || []).map((step) => {
    if (step.operationId !== operation.id) return step;
    const nextWorkCenterId = step.workCenterOverride ? step.workCenterId : operation.workCenterId;
    return {
      ...step,
	      operationName: operation.name || step.operationName,
	      operationType: operation.type,
	      workCenterId: nextWorkCenterId,
	      unitsPerHour: operation.unitsPerHour || step.unitsPerHour || getWorkCenterUnitsPerHour(nextWorkCenterId),
	      calculationType: step.calculationType || getDefaultOperationCalculationType(nextWorkCenterId, operation),
	      secondsPerPanel: step.secondsPerPanel || getDefaultSecondsPerPanel(nextWorkCenterId, step.boardsPerPanel || 1),
	      requiresBatch: operation.requiresBatch,
	      isWarehouseOperation: operation.isWarehouse,
	      updatedAt: new Date().toISOString(),
	    };
  });
  const linkedStepById = new Map((planningState.routeSteps || [])
    .filter((step) => step.operationId === operation.id)
    .map((step) => [step.id, step]));
  planningState.slots = (planningState.slots || []).map((slot) => {
    const step = linkedStepById.get(slot.routeStepId);
    if (!step || slot.locked || slot.status === "completed") return slot;
    return recalculateSlotEndByQuantity({
      ...slot,
      operationName: step.operationName || slot.operationName,
	      workCenterId: step.workCenterId || slot.workCenterId,
	      unitsPerHour: step.unitsPerHour || slot.unitsPerHour,
	      resourceId: step.resourceId || slot.resourceId || "",
	      calculationType: step.calculationType || slot.calculationType || "",
	      secondsPerPanel: step.secondsPerPanel || slot.secondsPerPanel || 0,
	      setupMin: step.setupMin || slot.setupMin || 0,
	      bomListId: step.bomListId || slot.bomListId || "",
	      updatedAt: new Date().toISOString(),
	    }, planningState);
	  });
	}

function deleteOperationMapItem(operationId) {
  const operation = getOperationMapItem(operationId);
  if (!operation) return;
  directoryState.operationMap = (directoryState.operationMap || []).filter((item) => item.id !== operationId);
  planningState.routeSteps = (planningState.routeSteps || []).map((step) => (
    step.operationId === operationId
      ? { ...step, operationId: "", operationName: step.operationName || operation.name || "", operationType: "", updatedAt: new Date().toISOString() }
      : step
  ));
  if (ui.activeOperationId === operationId) ui.activeOperationId = "";
  persistDirectoryState();
  persistState();
  persistUiState();
  notifySaveSuccess("Операция удалена");
  render();
}

function bindRoutesEvents() {
  app.querySelector("[data-route-create]")?.addEventListener("click", () => {
    ui.activeRouteId = "__new__";
    ui.activeProjectId = ui.activeProjectId || ui.activeSpecificationId || (directoryState.specifications || [])[0]?.id || "";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-route-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = planningState.routes.find((item) => item.id === button.dataset.routeOpen);
      if (!route) return;
      ui.activeRouteId = route.id;
      ui.activeProjectId = route.projectId;
      ensureRouteTaskSeedSteps(route.id, getRouteSpecification(route));
      persistUiState();
      persistState();
      render();
    });
  });

  app.querySelector("#routeModuleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveRouteModuleForm(event.currentTarget);
  });

  app.querySelector("[data-route-delete]")?.addEventListener("click", (event) => {
    event.preventDefault();
    const routeId = event.currentTarget.dataset.routeDelete || "";
    if (!routeId) return;
    openConfirmDialog("routeDeleteMap", { routeId });
  });

  app.querySelectorAll("[data-dense-route-field] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-route-field]");
      if (!root || !["projectId", "routeBindingId"].includes(root.dataset.denseRouteField)) return;
      updateRouteProject(button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-dense-route-step-field] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-route-step-field]");
      if (!root) return;
      updateRouteStepField(root.dataset.routeStepId, root.dataset.denseRouteStepField, button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-route-step-input]").forEach((field) => {
    field.addEventListener("change", () => {
      updateRouteStepField(field.dataset.routeStepInput, field.dataset.routeStepField, field.value);
    });
  });

  app.querySelectorAll("[data-route-add-step]").forEach((button) => {
    button.addEventListener("click", () => {
      addRouteModuleStep(button.dataset.routeAddStep || "workCenter");
    });
  });

  app.querySelectorAll("[data-route-step-up]").forEach((button) => {
    button.addEventListener("click", () => moveRouteStep(button.dataset.routeStepUp, -1));
  });

  app.querySelectorAll("[data-route-step-down]").forEach((button) => {
    button.addEventListener("click", () => moveRouteStep(button.dataset.routeStepDown, 1));
  });

  app.querySelectorAll("[data-route-step-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("routeDeleteStep", { stepId: button.dataset.routeStepDelete });
    });
  });

  app.querySelector("[data-route-to-planning]")?.addEventListener("click", () => {
    const route = getActiveRouteForModule();
    if (!route) {
      alert("Сначала сохраните маршрутную карту, затем передайте ее в заказ на пр-во.");
      return;
    }
    const specification = getRouteSpecification(route);
    const production = getProject(route.specificationId || route.projectId);
    if (!specification && !production) {
      alert("Чтобы передать маршрутную карту в заказ на пр-во, выберите спецификацию в карточке маршрута и сохраните карту.");
      return;
    }
    if (specification && !production) {
      ensureRouteModuleProjectForSpecification(specification);
    }
    ui.activeModule = "planning";
    ui.activeRouteId = route.id;
    ui.activeProjectId = specification?.id || route.specificationId || route.projectId;
    persistUiState();
    render();
  });
}

function saveRouteModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const existingRoute = getActiveRouteForModule();
  const routeBindingId = String(data.get("routeBindingId") || data.get("projectId") || ui.activeSpecificationId || existingRoute?.specificationId || existingRoute?.projectId || ui.activeProjectId || "");
  const projectId = resolveRouteModuleProjectId(routeBindingId, { createPlanningUnit: true });
  const selectedSpecification = getSpecificationById(routeBindingId) || getSpecificationByProjectId(projectId);
  const name = String(data.get("name") || "").trim();
  if (!name || !projectId) {
    alert("Заполните название маршрутной карты и спецификацию.");
    return;
  }

  const stamp = new Date().toISOString();
  const routeId = isNew ? makeId("r") : existingRoute?.id || String(data.get("routeId") || makeId("r"));
  const nextRoute = {
    ...(existingRoute || {}),
    id: routeId,
    specificationId: selectedSpecification?.id || projectId,
    specificationName: selectedSpecification?.name || "",
    projectId,
    name,
    isDefault: Boolean(existingRoute?.isDefault),
    updatedAt: stamp,
  };

  planningState.routes = [
    ...planningState.routes
      .filter((route) => route.id !== routeId),
    nextRoute,
  ];
  planningState = normalizePlanningState(planningState);
  ensureRouteTaskSeedSteps(routeId, selectedSpecification);
  ui.activeRouteId = routeId;
  ui.activeProjectId = projectId;
  if (selectedSpecification) ui.activeSpecificationId = selectedSpecification.id;
  persistState();
  persistUiState();
  notifySaveSuccess(isNew ? "Маршрутная карта создана" : "Маршрутная карта сохранена");
  render();
}

function updateRouteProject(selectionValue) {
  if (!selectionValue) return;
  const activeRoute = getActiveRouteForModule();
  const selectedSpecification = getSpecificationById(selectionValue) || getSpecificationByProjectId(selectionValue);
  const projectId = resolveRouteModuleProjectId(selectionValue, {
    createPlanningUnit: Boolean(activeRoute && ui.activeRouteId !== "__new__"),
  });
  if (selectedSpecification) ui.activeSpecificationId = selectedSpecification.id;
  if (!activeRoute || ui.activeRouteId === "__new__") {
    ui.activeProjectId = projectId || selectedSpecification?.id || "";
    persistUiState();
    render();
    return;
  }

  if (!projectId) return;
  planningState.routes = planningState.routes.map((route) => (
    route.id === activeRoute.id
      ? { ...route, specificationId: selectedSpecification?.id || projectId, specificationName: selectedSpecification?.name || "", projectId, updatedAt: new Date().toISOString() }
      : route
  ));
  if (selectedSpecification) ensureRouteTaskSeedSteps(activeRoute.id, selectedSpecification);
  ui.activeProjectId = projectId;
  persistState();
  persistUiState();
  notifySaveSuccess("Маршрутная карта сохранена");
  render();
}

function updateRouteStepField(stepId, field, rawValue) {
  const step = planningState.routeSteps.find((item) => item.id === stepId);
  if (!step || !field) return;
  const oldCenter = getWorkCenter(step.workCenterId);
  let value = rawValue;
  if (field === "operationId" && String(value || "").startsWith("legacy:")) return;
  if (["stepOrder", "setupMin", "secondsPerPanel"].includes(field)) {
    value = Math.max(field === "stepOrder" ? 1 : 0, Math.round(Number(rawValue || 0)));
  }
  if (field === "unitsPerHour") {
    value = Math.max(0, Math.round(Number(rawValue || 0) * 10) / 10);
  }

  planningState.routeSteps = planningState.routeSteps.map((item) => {
    if (item.id !== stepId) return item;
    const next = { ...item, [field]: value, updatedAt: new Date().toISOString() };
    if (field === "operationId") {
      const operation = getOperationMapItem(value);
      if (operation) {
        next.operationId = operation.id;
        next.operationName = operation.name || "Операция";
	        next.operationType = operation.type;
	        next.workCenterId = operation.workCenterId || next.workCenterId;
	        next.workCenterOverride = false;
	        next.unitsPerHour = operation.unitsPerHour || getWorkCenterUnitsPerHour(next.workCenterId);
	        next.calculationType = getDefaultOperationCalculationType(next.workCenterId, operation);
	        next.secondsPerPanel = next.calculationType === "manual" || next.calculationType === "normative"
	          ? Number(next.secondsPerPanel || getDefaultSecondsPerPanel(next.workCenterId, next.boardsPerPanel || 1))
	          : 0;
	        next.setupMin = Math.max(0, Number(next.setupMin || 0));
	        next.requiresBatch = operation.requiresBatch;
	        next.isWarehouseOperation = operation.isWarehouse;
	      }
	    }
	    if (field === "workCenterId") {
	      const center = getWorkCenter(value);
	      const resources = getResourcesForWorkCenter(value);
	      const resource = resources.find((item) => item.id === next.resourceId) || resources[0] || null;
	      const shouldRename = !item.operationName || item.operationName === oldCenter?.name || item.operationName === oldCenter?.code;
	      next.operationName = shouldRename ? center?.name || "Операция" : item.operationName;
	      if (item.operationId) {
	        const operation = getOperationMapItem(item.operationId);
	        next.workCenterOverride = Boolean(operation && operation.workCenterId !== value);
	      }
	      if (!Number(next.unitsPerHour || 0)) next.unitsPerHour = getWorkCenterUnitsPerHour(value);
	      next.resourceId = resource?.id || "";
	      next.calculationType = getDefaultOperationCalculationType(value, next);
	      next.secondsPerPanel = next.calculationType === "manual" || next.calculationType === "normative"
	        ? getDefaultSecondsPerPanel(value, next.boardsPerPanel || 1)
	        : 0;
	      next.setupMin = Number(resource?.changeoverMin || 0);
	    }
	    return next;
	  });

  if (field === "stepOrder") normalizeRouteStepOrders(step.routeId, getRouteStepTaskId(step));
	  if (["operationId", "workCenterId", "unitsPerHour", "secondsPerPanel", "setupMin", "calculationType", "resourceId", "bomListId", "boardsPerPanel"].includes(field)) {
	    const updatedStep = planningState.routeSteps.find((item) => item.id === stepId);
	    planningState.slots = planningState.slots.map((slot) => {
	      if (slot.routeStepId !== stepId || slot.locked || slot.status === "completed" || !updatedStep) return slot;
	      return recalculateSlotEndByQuantity({
	        ...slot,
	        workCenterId: updatedStep.workCenterId,
	        operationName: updatedStep.operationName || slot.operationName,
	        unitsPerHour: updatedStep.unitsPerHour || slot.unitsPerHour,
	        boardsPerPanel: updatedStep.boardsPerPanel || slot.boardsPerPanel || 1,
	        resourceId: updatedStep.resourceId || slot.resourceId || "",
	        calculationType: updatedStep.calculationType || slot.calculationType || "",
	        secondsPerPanel: updatedStep.secondsPerPanel || slot.secondsPerPanel || 0,
	        setupMin: updatedStep.setupMin || slot.setupMin || 0,
	        bomListId: updatedStep.bomListId || slot.bomListId || "",
	        updatedAt: new Date().toISOString(),
	      }, planningState);
	    });
	  }
  persistState();
  notifySaveSuccess("Операция маршрута сохранена");
  render();
}

function appendRouteTaskTemplateSteps(route, task) {
  if (!route || !task || task.isMain || task.isOrphan) return 0;
  const steps = getRouteStepsForModule(route.id);
  const taskSteps = getRouteStepsForTask(steps, task.id);
  const existingKeys = new Set(taskSteps.map((step) => `${step.workCenterId}::${normalizeLookupText(step.operationName)}`));
  const templates = getRouteTaskTemplateSteps(task)
    .filter((template) => !existingKeys.has(`${template.workCenterId}::${normalizeLookupText(template.operationName)}`));
  if (!templates.length) return 0;

  const warehouseStep = taskSteps.find((step) => step.workCenterId === "warehouse");
  const insertOrder = warehouseStep?.stepOrder || Math.max(0, ...taskSteps.map((step) => Number(step.stepOrder || 0))) + 1;
  const stamp = new Date().toISOString();
  planningState.routeSteps = [
    ...planningState.routeSteps.map((step) => (
      step.routeId === route.id && getRouteStepTaskId(step) === task.id && Number(step.stepOrder || 0) >= insertOrder
        ? { ...step, stepOrder: Number(step.stepOrder || 0) + templates.length }
        : step
    )),
    ...templates.map((template, index) => createRouteStepFromTaskTemplate(route.id, task, template, insertOrder + index, stamp)),
  ];
  normalizeRouteStepOrders(route.id, task.id);
  return templates.length;
}

function seedRouteTaskTemplate(taskId = "") {
  const route = getActiveRouteForModule();
  if (!route || !taskId) return;
  const task = getRouteTasksForModule(route).find((item) => item.id === taskId);
  const addedCount = appendRouteTaskTemplateSteps(route, task);
  if (!addedCount) {
    alert("Для этой задачи уже есть все операции типового маршрута.");
    return;
  }
  persistState();
  notifySaveSuccess("Операции маршрута добавлены");
  render();
}

function seedAllRouteTaskTemplates() {
  const route = getActiveRouteForModule();
  if (!route) return;
  const tasks = getRouteTasksForModule(route).filter((task) => !task.isMain && !task.isOrphan);
  const addedCount = tasks.reduce((sum, task) => sum + appendRouteTaskTemplateSteps(route, task), 0);
  if (!addedCount) {
    alert("Для всех задач уже сформированы типовые маршруты.");
    return;
  }
  persistState();
  render();
}

function getDefaultOperationMapItemForRouteKind(operationKind = "workCenter") {
  const operations = getOperationMapRows();
  if (operationKind === "warehouse") {
    return operations.find((operation) => operation.type === "warehouse" || operation.workCenterId === "warehouse") || null;
  }
  return operations.find((operation) => operation.type !== "warehouse" && operation.workCenterId !== "warehouse")
    || operations.find((operation) => operation.type !== "warehouse")
    || null;
}

function addRouteModuleStep(operationKind = "workCenter") {
  const route = getActiveRouteForModule();
  if (!route) return;
  const steps = getRouteStepsForModule(route.id);
  const warehouseStep = steps.find((step) => step.workCenterId === "warehouse");
  const isWarehouse = operationKind === "warehouse";
  const operation = getDefaultOperationMapItemForRouteKind(operationKind);
  const insertOrder = isWarehouse
    ? Math.max(0, ...steps.map((step) => Number(step.stepOrder || 0))) + 1
    : warehouseStep?.stepOrder || Math.max(0, ...steps.map((step) => Number(step.stepOrder || 0))) + 1;
	  const workCenterId = isWarehouse
	    ? operation?.workCenterId || "warehouse"
	    : getPlanningWorkCenters({ includeWarehouse: false })[0]?.id || "manual";
	  const routeWorkCenterId = operation?.workCenterId || workCenterId;
	  const center = getWorkCenter(workCenterId);
	  const resources = getResourcesForWorkCenter(routeWorkCenterId);
	  const resource = resources[0] || null;
	  const calculationType = getDefaultOperationCalculationType(routeWorkCenterId, operation);

	  planningState.routeSteps = [
    ...planningState.routeSteps.map((step) => (
      step.routeId === route.id && Number(step.stepOrder || 0) >= insertOrder
        ? { ...step, stepOrder: Number(step.stepOrder || 0) + 1 }
        : step
    )),
    {
      id: makeId("rs"),
      routeId: route.id,
      specTaskId: "",
      specTaskSourceItemId: "",
      specTaskName: "",
      specTaskQuantity: 1,
      bomListId: "",
      boardsPerPanel: 1,
      operationId: operation?.id || "",
      operationType: operation?.type || (isWarehouse ? "warehouse" : "production"),
      workCenterId: routeWorkCenterId,
      workCenterOverride: false,
      operationName: operation?.name || (isWarehouse ? "Склад" : center?.name || "Новая операция"),
      stepOrder: insertOrder,
      isRequired: true,
	      quantityMultiplier: 1,
	      unitsPerHour: operation?.unitsPerHour || getWorkCenterUnitsPerHour(routeWorkCenterId),
	      resourceId: resource?.id || "",
	      calculationType,
	      secondsPerPanel: calculationType === "manual" || calculationType === "normative"
	        ? getDefaultSecondsPerPanel(routeWorkCenterId, 1)
	        : 0,
	      requiresBatch: operation?.requiresBatch ?? !isWarehouse,
	      isWarehouseOperation: operation?.isWarehouse || isWarehouse,
	      setupMin: Number(resource?.changeoverMin || 0),
	      updatedAt: new Date().toISOString(),
	    },
  ];
  normalizeRouteStepOrders(route.id);
  persistState();
  notifySaveSuccess(isWarehouse ? "Операция склада добавлена" : "Операция подразделения добавлена");
  render();
}

function moveRouteStep(stepId, direction) {
  const step = planningState.routeSteps.find((item) => item.id === stepId);
  if (!step) return;
  const steps = getRouteStepsForModule(step.routeId);
  const index = steps.findIndex((item) => item.id === stepId);
  if (index < 0) return;
  const target = steps[index + direction];
  if (!target) return;
  const leftOrder = step.stepOrder;
  const rightOrder = target.stepOrder;
  planningState.routeSteps = planningState.routeSteps.map((item) => {
    if (item.id === step.id) return { ...item, stepOrder: rightOrder, updatedAt: new Date().toISOString() };
    if (item.id === target.id) return { ...item, stepOrder: leftOrder, updatedAt: new Date().toISOString() };
    return item;
  });
  normalizeRouteStepOrders(step.routeId);
  persistState();
  notifySaveSuccess("Порядок операций сохранен");
  render();
}

function normalizeRouteStepOrders(routeId, taskId = null) {
  const sourceSteps = getRouteStepsForModule(routeId)
    .filter((step) => !taskId || getRouteStepTaskId(step) === taskId);
  const orderedIds = sourceSteps.map((step) => step.id);
  planningState.routeSteps = planningState.routeSteps.map((step) => {
    const index = orderedIds.indexOf(step.id);
    return index >= 0 ? { ...step, stepOrder: index + 1 } : step;
  });
}

function deleteRouteStepConfirmed(stepId) {
  const step = planningState.routeSteps.find((item) => item.id === stepId);
  if (!step) return;
  if (step.workCenterId === "warehouse") {
    alert("Склад должен оставаться конечным этапом маршрута.");
    return;
  }
  const routeId = step.routeId;
  planningState.routeSteps = planningState.routeSteps.filter((item) => item.id !== stepId);
  normalizeRouteStepOrders(routeId);
  withPlanningEntityRemovalAllowed(() => persistState());
  notifySaveSuccess("Операция маршрута удалена");
  render();
}

function bindSpekiEvents() {
  app.querySelector("[data-speki-create-specification]")?.addEventListener("click", () => {
    createSpekiSpecification();
  });

  app.querySelectorAll("[data-speki-spec-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const specificationId = button.dataset.spekiSpecOpen || "";
      const specification = (directoryState.specifications || []).find((item) => item.id === specificationId);
      if (!specification) return;
      ui.activeSpecificationId = specification.id;
      ui.activeProjectId = specification.id;
      ui.spekiEditingId = "";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-speki-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const specificationId = button.dataset.spekiEdit || "";
      if (!specificationId) return;
      ui.spekiEditingId = specificationId;
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-speki-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const specificationId = button.dataset.spekiSave || "";
      const nameInput = [...app.querySelectorAll("[data-speki-spec-name]")]
        .find((input) => input.dataset.spekiSpecName === specificationId);
      saveSpekiSpecification(specificationId, nameInput?.value || "");
    });
  });

  app.querySelectorAll("[data-speki-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("spekiDeleteSpecification", { specificationId: button.dataset.spekiDelete || "" });
    });
  });

  app.querySelectorAll("[data-speki-add-row]").forEach((button) => {
    button.addEventListener("click", () => {
      addSpecificationStructureItem(button.dataset.spekiAddRow || "nomenclature");
    });
  });

  app.querySelectorAll("[data-speki-structure-input]").forEach((field) => {
    const commit = () => {
      updateSpecificationStructureItem(
        field.dataset.spekiStructureInput || "",
        field.dataset.spekiStructureField || "",
        field.value,
      );
    };
    field.addEventListener("change", commit);
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      field.blur();
      commit();
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-type] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-type]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureType || "", "type", button.dataset.denseValue || "nomenclature");
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-specification] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-specification]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureSpecification || "", "specificationId", button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-dense-speki-structure-nomenclature] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-speki-structure-nomenclature]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpekiStructureNomenclature || "", "nomenclatureId", button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-speki-structure-up]").forEach((button) => {
    button.addEventListener("click", () => moveSpecificationStructureItem(button.dataset.spekiStructureUp || "", -1));
  });

  app.querySelectorAll("[data-speki-structure-down]").forEach((button) => {
    button.addEventListener("click", () => moveSpecificationStructureItem(button.dataset.spekiStructureDown || "", 1));
  });

  app.querySelectorAll("[data-speki-structure-indent]").forEach((button) => {
    button.addEventListener("click", () => changeSpekiStructureLevel(button.dataset.spekiStructureIndent || "", 1));
  });

  app.querySelectorAll("[data-speki-structure-outdent]").forEach((button) => {
    button.addEventListener("click", () => changeSpekiStructureLevel(button.dataset.spekiStructureOutdent || "", -1));
  });

  app.querySelectorAll("[data-speki-structure-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteSpecificationStructureItem(button.dataset.spekiStructureDelete || ""));
  });

  app.querySelectorAll("[data-speki-create-node-from-row]").forEach((button) => {
    button.addEventListener("click", () => createSpekiNodeFromRow(button.dataset.spekiCreateNodeFromRow || ""));
  });
}

function bindSpecificationsEvents() {
  app.querySelector("[data-specification-create]")?.addEventListener("click", () => {
    ui.activeSpecificationId = "__new__";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-specification-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const specification = (directoryState.specifications || []).find((item) => item.id === button.dataset.specificationOpen);
      if (!specification) return;
      ui.activeSpecificationId = specification.id;
      ui.activeProjectId = specification.projectId;
      persistUiState();
      render();
    });
  });

  app.querySelector("#specificationModuleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSpecificationModuleForm(event.currentTarget);
  });

  app.querySelectorAll("[data-spec-production-status-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = app.querySelector("[data-spec-production-status-input]");
      if (!input) return;
      input.value = button.dataset.specProductionStatusOption || "planned";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      app.querySelectorAll("[data-spec-production-status-option]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
    });
  });

  app.querySelector("[data-specification-to-calculator]")?.addEventListener("click", () => {
    const specification = getActiveSpecificationForModule();
    if (!specification) return;
    openProjectInCalculator(specification.projectId, specification.id);
  });

  app.querySelector("[data-specification-delete]")?.addEventListener("click", (event) => {
    openConfirmDialog("spekiDeleteSpecification", { specificationId: event.currentTarget.dataset.specificationDelete || "" });
  });

  app.querySelector("[data-open-spec-boms]")?.addEventListener("click", () => {
    const specification = getActiveSpecificationForModule();
    ui.activeModule = "bomLists";
    if (specification) {
      ui.activeProjectId = specification.projectId;
      ui.activeBomId = specification.bomListA || specification.bomListB || (directoryState.bomLists || []).find((bom) => bom.projectId === specification.projectId)?.id || "__new__";
    }
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-spec-add-item]").forEach((button) => {
    button.addEventListener("click", () => {
      addSpecificationStructureItem(button.dataset.specAddItem || "part");
    });
  });

  app.querySelectorAll("[data-spec-structure-input]").forEach((field) => {
    field.addEventListener("change", () => {
      updateSpecificationStructureItem(field.dataset.specStructureInput, field.dataset.specStructureField, field.value);
    });
  });

  app.querySelectorAll("[data-spec-structure-type]").forEach((button) => {
    button.addEventListener("click", () => {
      updateSpecificationStructureItem(button.dataset.specStructureType, "type", button.dataset.specStructureTypeValue || "part");
    });
  });

  app.querySelectorAll("[data-dense-spec-structure-bom] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-spec-structure-bom]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpecStructureBom, "bomListId", button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-dense-spec-structure-parent] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-spec-structure-parent]");
      if (!root) return;
      updateSpecificationStructureItem(root.dataset.denseSpecStructureParent, "parentId", button.dataset.denseValue || "root");
    });
  });

  app.querySelectorAll("[data-spec-structure-up]").forEach((button) => {
    button.addEventListener("click", () => moveSpecificationStructureItem(button.dataset.specStructureUp, -1));
  });

  app.querySelectorAll("[data-spec-structure-down]").forEach((button) => {
    button.addEventListener("click", () => moveSpecificationStructureItem(button.dataset.specStructureDown, 1));
  });

  app.querySelectorAll("[data-spec-structure-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteSpecificationStructureItem(button.dataset.specStructureDelete));
  });
}

function updateSpecificationStructure(updater) {
  const activeSpecification = getActiveSpecificationForModule();
  if (!activeSpecification) {
    alert("Сначала сохраните карточку спецификации.");
    return;
  }

  const currentItems = getSpecificationStructureItems(activeSpecification);
  const nextItems = updater(currentItems)
    .map((item, index) => normalizeSpecificationStructureItem({ ...item, position: index + 1 }, index));
  const nextSpecification = syncSpecificationDerivedFields({
    ...activeSpecification,
    structureManaged: true,
    structureItems: nextItems,
    updatedAt: new Date().toISOString(),
  });

  directoryState.specifications = (directoryState.specifications || []).map((specification) => (
    specification.id === activeSpecification.id ? nextSpecification : specification
  ));
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess("Структура спецификации сохранена");
  render();
}

function addSpecificationStructureItem(type) {
  const activeSpecification = getActiveSpecificationForModule();
  if (!activeSpecification) {
    alert("Сначала сохраните карточку спецификации.");
    return;
  }

  const allowedTypes = new Set(["assembly", "specification", "part", "nomenclature"]);
  const nextType = allowedTypes.has(type) ? type : "nomenclature";
  const currentItems = getSpecificationStructureItems(activeSpecification);
  const linkedSpecification = (directoryState.specifications || []).find((specification) => specification.id !== activeSpecification.id) || null;
  const nomenclatureItem = (directoryState.nomenclature || [])[0] || null;
  const executionType = nextType === "nomenclature" || nextType === "part" ? getDefaultNomenclatureExecutionType(nomenclatureItem) : "make";
  const operationName = nextType === "nomenclature" || nextType === "part"
    ? getDefaultSpekiOperationForNomenclature(nomenclatureItem, executionType)
    : getDefaultSpekiOperationName(nextType, executionType);
  updateSpecificationStructure((items) => [
    ...items,
    normalizeSpecificationStructureItem({
      id: makeId("spi"),
      parentId: "root",
      type: nextType,
      specificationId: nextType === "specification" ? linkedSpecification?.id || "" : "",
      nomenclatureId: nextType === "nomenclature" ? nomenclatureItem?.id || "" : "",
      executionType,
      operationName,
      departmentName: getDefaultSpekiDepartmentName(operationName),
      name: nextType === "specification"
          ? linkedSpecification?.name || "Вложенная спецификация"
          : nextType === "assembly"
            ? "Новый узел"
            : nomenclatureItem?.name || "Номенклатура не выбрана",
      quantity: 1,
      unit: nextType === "assembly" ? "узел" : nextType === "specification" ? "спец." : nomenclatureItem?.unit || "шт.",
      boardsPerPanel: 1,
      resultItem: nextType === "specification"
          ? linkedSpecification?.outputItem || ""
          : nextType === "assembly"
            ? "Новый узел"
            : nomenclatureItem?.name || "",
      note: nextType === "assembly" ? "Узел" : nextType === "specification" ? "Спецификация" : nextType === "nomenclature" ? "Номенклатура" : "",
      position: items.length + 1,
    }, items.length),
  ]);
}

function getDefaultNomenclatureExecutionType(item) {
  const type = normalizeNomenclatureType(item?.type);
  if (item?.sourceBomResultId) return "make";
  return type === "Производимые узлы" ? "make" : "buy";
}

function getDefaultSpekiOperationForNomenclature(item, executionType) {
  if (executionType === "buy") return "";
  const type = normalizeNomenclatureType(item?.type);
  if (item?.sourceBomResultId) return "SMT-монтаж";
  if (type === "Производимые узлы") return "Сборка";
  if (type === "Печатные платы") return "Входной контроль";
  return "Подготовка";
}

function addSpecificationStructureItemFromSource(sourceType, sourceId = "", options = {}) {
  const activeSpecification = getActiveSpecificationForModule();
  if (!activeSpecification) {
    alert("Сначала создайте спецификацию.");
    return;
  }

  const quantity = normalizeOptionalPositiveInteger(options.quantity) || 1;
  const stampIndex = getSpecificationStructureItems(activeSpecification).length;

  if (sourceType === "assembly") {
    addSpecificationStructureItem("assembly");
    return;
  }

  let nextItem = null;
  if (sourceType === "bom" || sourceType === "bomResult") {
    const bom = getBomList(sourceId);
    if (!bom) return;
    const stamp = new Date().toISOString();
    const nomenclatureItem = getBomResultNomenclatureItem(bom.id) || upsertBomResultToNomenclature(bom, stamp);
    if (!nomenclatureItem) return;
    const executionType = getDefaultNomenclatureExecutionType(nomenclatureItem);
    const operationName = getDefaultSpekiOperationForNomenclature(nomenclatureItem, executionType);
    nextItem = normalizeSpecificationStructureItem({
      id: makeId("spi"),
      parentId: "root",
      type: "nomenclature",
      nomenclatureId: nomenclatureItem.id,
      executionType,
      operationName,
      departmentName: executionType === "make" ? getDefaultSpekiDepartmentName(operationName) : "",
      name: nomenclatureItem.name || bom.resultItem || bom.name || "",
      quantity,
      unit: nomenclatureItem.unit || "шт.",
      boardsPerPanel: 1,
      resultItem: nomenclatureItem.name || bom.resultItem || bom.boardCode || "",
      note: "Результат BOM",
      position: stampIndex + 1,
    }, stampIndex);
  }

  if (sourceType === "specification") {
    const linkedSpecification = (directoryState.specifications || [])
      .find((specification) => specification.id === sourceId && specification.id !== activeSpecification.id);
    if (!linkedSpecification) return;
    const operationName = getDefaultSpekiOperationName("specification", "make");
    nextItem = normalizeSpecificationStructureItem({
      id: makeId("spi"),
      parentId: "root",
      type: "specification",
      specificationId: linkedSpecification.id,
      executionType: "make",
      operationName,
      departmentName: getDefaultSpekiDepartmentName(operationName),
      name: linkedSpecification.name || "",
      quantity,
      unit: "спец.",
      resultItem: linkedSpecification.outputItem || "",
      note: "Спецификация",
      position: stampIndex + 1,
    }, stampIndex);
  }

  if (sourceType === "nomenclature") {
    const nomenclatureItem = (directoryState.nomenclature || []).find((item) => item.id === sourceId);
    if (!nomenclatureItem) return;
    const executionType = getDefaultNomenclatureExecutionType(nomenclatureItem);
    const operationName = getDefaultSpekiOperationForNomenclature(nomenclatureItem, executionType);
    nextItem = normalizeSpecificationStructureItem({
      id: makeId("spi"),
      parentId: "root",
      type: "nomenclature",
      nomenclatureId: nomenclatureItem.id,
      executionType,
      operationName,
      departmentName: executionType === "make" ? getDefaultSpekiDepartmentName(operationName) : "",
      name: nomenclatureItem.name || "",
      quantity,
      unit: nomenclatureItem.unit || "шт.",
      resultItem: nomenclatureItem.name || "",
      note: normalizeNomenclatureType(nomenclatureItem.type),
      position: stampIndex + 1,
    }, stampIndex);
  }

  if (!nextItem) return;
  updateSpecificationStructure((items) => [...items, nextItem]);
}

function updateSpecificationStructureItem(itemId, field, value) {
  if (!itemId || !field) return;
  clearSpekiStaleItem(itemId);
  updateSpecificationStructure((items) => {
    const descendantIds = getSpecificationStructureDescendantIds(itemId, items);
    let shouldMoveChildrenToRoot = false;
    const nextItems = items.map((item) => {
      if (item.id !== itemId) return item;
      const nextItem = { ...item };

      if (field === "type") {
        nextItem.type = ["assembly", "bom", "specification", "part", "nomenclature"].includes(value) ? value : "nomenclature";
        const selectedNomenclature = nextItem.type === "nomenclature"
          ? (directoryState.nomenclature || []).find((entry) => entry.id === nextItem.nomenclatureId) || (directoryState.nomenclature || [])[0]
          : null;
        nextItem.executionType = nextItem.type === "nomenclature" || nextItem.type === "part" ? getDefaultNomenclatureExecutionType(selectedNomenclature) : "make";
        nextItem.operationName = nextItem.type === "nomenclature" || nextItem.type === "part"
          ? getDefaultSpekiOperationForNomenclature(selectedNomenclature, nextItem.executionType)
          : getDefaultSpekiOperationName(nextItem.type, nextItem.executionType);
        nextItem.departmentName = getDefaultSpekiDepartmentName(nextItem.operationName);
        shouldMoveChildrenToRoot = nextItem.type !== "assembly";
        if (nextItem.type !== "bom") {
          nextItem.bomListId = "";
          nextItem.boardsPerPanel = 1;
        }
        if (nextItem.type !== "specification") {
          nextItem.specificationId = "";
        }
        if (nextItem.type !== "nomenclature") {
          nextItem.nomenclatureId = "";
        }
        if (nextItem.type === "bom" && !nextItem.bomListId) {
          const defaultBom = pickDefaultBomForSpecificationItem(getActiveSpecificationForModule(), items, itemId);
          nextItem.bomListId = defaultBom?.id || "";
          nextItem.boardsPerPanel = normalizeBoardsPerPanel(nextItem.boardsPerPanel, 1);
        }
        if (nextItem.type === "specification" && !nextItem.specificationId) {
          const activeSpecification = getActiveSpecificationForModule();
          const linkedSpecification = (directoryState.specifications || []).find((specification) => specification.id !== activeSpecification?.id);
          nextItem.specificationId = linkedSpecification?.id || "";
        }
        if (nextItem.type === "nomenclature" && !nextItem.nomenclatureId) {
          nextItem.nomenclatureId = (directoryState.nomenclature || [])[0]?.id || "";
        }
        const bom = nextItem.type === "bom" ? getBomList(nextItem.bomListId) : null;
        const linkedSpecification = nextItem.type === "specification"
          ? (directoryState.specifications || []).find((specification) => specification.id === nextItem.specificationId)
          : null;
        const nomenclatureItem = nextItem.type === "nomenclature"
          ? (directoryState.nomenclature || []).find((entry) => entry.id === nextItem.nomenclatureId)
          : null;
        nextItem.name = nextItem.type === "bom"
          ? bom?.name || nextItem.name
          : nextItem.type === "specification"
            ? linkedSpecification?.name || nextItem.name || "Вложенная спецификация"
            : nextItem.type === "nomenclature"
              ? nomenclatureItem?.name || nextItem.name || "Номенклатура не выбрана"
              : nextItem.name || (nextItem.type === "assembly" ? "Новый узел" : "Новая позиция");
        nextItem.unit = nextItem.type === "assembly" ? "узел" : nextItem.type === "bom" ? "плата" : nextItem.type === "specification" ? "спец." : nextItem.type === "nomenclature" ? nomenclatureItem?.unit || nextItem.unit || "шт." : nextItem.unit || "шт.";
        nextItem.resultItem = nextItem.type === "bom"
          ? bom?.resultItem || bom?.boardCode || ""
          : nextItem.type === "specification"
            ? linkedSpecification?.outputItem || ""
            : nextItem.type === "nomenclature"
              ? nomenclatureItem?.name || nextItem.resultItem || ""
              : nextItem.type === "assembly"
                ? nextItem.name || "Новый узел"
                : nextItem.resultItem;
        return nextItem;
      }

      if (field === "bomListId") {
        const bom = getBomList(value);
        nextItem.bomListId = bom?.id || "";
        nextItem.name = bom?.name || "";
        nextItem.resultItem = bom?.resultItem || bom?.boardCode || "";
        nextItem.boardsPerPanel = normalizeBoardsPerPanel(nextItem.boardsPerPanel, 1);
        if (!nextItem.note) nextItem.note = "BOM";
        return nextItem;
      }

      if (field === "specificationId") {
        const activeSpecification = getActiveSpecificationForModule();
        const linkedSpecification = (directoryState.specifications || [])
          .find((specification) => specification.id === value && specification.id !== activeSpecification?.id);
        nextItem.specificationId = linkedSpecification?.id || "";
        nextItem.name = linkedSpecification?.name || "";
        nextItem.resultItem = linkedSpecification?.outputItem || "";
        if (!nextItem.note) nextItem.note = "Спецификация";
        return nextItem;
      }

      if (field === "nomenclatureId") {
        const nomenclatureItem = (directoryState.nomenclature || []).find((entry) => entry.id === value);
        nextItem.nomenclatureId = nomenclatureItem?.id || "";
        nextItem.name = nomenclatureItem?.name || "";
        nextItem.resultItem = nomenclatureItem?.name || "";
        nextItem.unit = nomenclatureItem?.unit || nextItem.unit || "шт.";
        nextItem.executionType = getDefaultNomenclatureExecutionType(nomenclatureItem);
        nextItem.operationName = getDefaultSpekiOperationForNomenclature(nomenclatureItem, nextItem.executionType);
        nextItem.departmentName = nextItem.executionType === "make" ? getDefaultSpekiDepartmentName(nextItem.operationName) : "";
        if (!nextItem.note) nextItem.note = "Номенклатура";
        return nextItem;
      }

      if (field === "parentId") {
        const nextParent = value && value !== itemId && !descendantIds.has(value) ? value : "root";
        nextItem.parentId = nextParent || "root";
        return nextItem;
      }

      if (field === "executionType") {
        nextItem.executionType = value === "buy" ? "buy" : "make";
        nextItem.operationName = nextItem.executionType === "buy"
          ? ""
          : nextItem.operationName || getDefaultSpekiOperationName(nextItem.type, nextItem.executionType);
        nextItem.departmentName = nextItem.executionType === "buy"
          ? ""
          : nextItem.departmentName || getDefaultSpekiDepartmentName(nextItem.operationName);
        return nextItem;
      }

      if (field === "operationName") {
        nextItem.operationName = String(value || "").trim();
        if (!nextItem.operationName) {
          nextItem.departmentName = "";
        } else if (!nextItem.departmentName) {
          nextItem.departmentName = getDefaultSpekiDepartmentName(nextItem.operationName);
        }
        return nextItem;
      }

      if (field === "departmentName") {
        nextItem.departmentName = String(value || "").trim();
        return nextItem;
      }

      if (field === "quantity") {
        const quantity = Number(value || 0);
        nextItem.quantity = Number.isFinite(quantity) && quantity >= 0 ? Math.round(quantity) : 0;
        return nextItem;
      }

      if (field === "boardsPerPanel") {
        nextItem.boardsPerPanel = nextItem.type === "bom" ? normalizeBoardsPerPanel(value, 1) : 1;
        return nextItem;
      }

      if (["name", "unit", "note", "resultItem"].includes(field)) {
        nextItem[field] = String(value || "").trim();
      }
      return nextItem;
    });
    return shouldMoveChildrenToRoot
      ? nextItems.map((item) => item.parentId === itemId ? { ...item, parentId: "root" } : item)
      : nextItems;
  });
}

function getSpecificationStructureDescendantIds(parentId, items) {
  const descendants = new Set();
  const collect = (id) => {
    items
      .filter((item) => item.parentId === id && !descendants.has(item.id))
      .forEach((item) => {
        descendants.add(item.id);
        collect(item.id);
      });
  };
  collect(parentId);
  return descendants;
}

function changeSpekiStructureLevel(itemId, direction) {
  const activeSpecification = getActiveSpecificationForModule();
  if (!activeSpecification || !itemId || !direction) return;

  const rows = getSpekiStructureTableRows(activeSpecification);
  const rowIndex = rows.findIndex((row) => row.item.id === itemId);
  if (rowIndex < 0) return;

  if (direction > 0) {
    const previousRow = rows[rowIndex - 1];
    if (!previousRow) return;
    updateSpecificationStructureItem(itemId, "parentId", previousRow.item.id);
    return;
  }

  const currentItem = rows[rowIndex].item;
  const parentItem = getSpecificationStructureItems(activeSpecification)
    .find((item) => item.id === currentItem.parentId);
  updateSpecificationStructureItem(itemId, "parentId", parentItem?.parentId || "root");
}

function createSpekiNodeFromRow(itemId) {
  const activeSpecification = getActiveSpecificationForModule();
  if (!activeSpecification || !itemId) return;

  const rows = getSpekiStructureTableRows(activeSpecification);
  const rowIndex = rows.findIndex((row) => row.item.id === itemId);
  const row = rows[rowIndex];
  if (!row || row.item.type === "assembly") return;

  const rowParentId = row.item.parentId || "root";
  const nextSibling = rows.slice(rowIndex + 1)
    .find((candidate) => candidate.level === row.level && (candidate.item.parentId || "root") === rowParentId);
  if (!nextSibling) {
    alert("Для создания узла нужна следующая строка того же уровня.");
    return;
  }

  const nodeId = makeId("spi");
  const nodeName = `Узел ${row.number}`;
  const nodeOperationName = getDefaultSpekiOperationName("assembly", "make");
  const nodeDepartmentName = getDefaultSpekiDepartmentName(nodeOperationName);
  const childIds = new Set([row.item.id, nextSibling.item.id]);
  updateSpecificationStructure((items) => {
    const nextItems = [];
    let insertedNode = false;
    items.forEach((item) => {
      if (!insertedNode && item.id === row.item.id) {
        nextItems.push({
          id: nodeId,
          parentId: rowParentId,
          type: "assembly",
          executionType: "make",
          operationName: nodeOperationName,
          departmentName: nodeDepartmentName,
          name: nodeName,
          quantity: 1,
          unit: "узел",
          resultItem: nodeName,
          note: "Узел",
        });
        insertedNode = true;
      }
      nextItems.push(childIds.has(item.id) ? { ...item, parentId: nodeId } : item);
    });
    if (!insertedNode) {
      nextItems.push({
        id: nodeId,
        parentId: rowParentId,
        type: "assembly",
        executionType: "make",
        operationName: nodeOperationName,
        departmentName: nodeDepartmentName,
        name: nodeName,
        quantity: 1,
        unit: "узел",
        resultItem: nodeName,
        note: "Узел",
      });
    }
    return nextItems;
  });
}

function saveSpekiSpecification(specificationId, value) {
  if (!specificationId) return;
  const name = String(value || "").trim() || "Спецификация без названия";
  directoryState.specifications = (directoryState.specifications || []).map((specification) => (
    specification.id === specificationId
      ? { ...specification, name, updatedAt: new Date().toISOString() }
      : specification
  ));
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ui.activeSpecificationId = specificationId;
  ui.spekiEditingId = "";
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess("Спецификация сохранена");
  render();
}

function getSpecificationDeleteUsage(specificationId) {
  const routeIds = new Set((planningState.routes || [])
    .filter((route) => (
      route.id === specificationId
      || route.specificationId === specificationId
      || route.projectId === specificationId
    ))
    .map((route) => route.id));
  const routeStepIds = new Set((planningState.routeSteps || [])
    .filter((step) => routeIds.has(step.routeId))
    .map((step) => step.id));
  const batchIds = new Set((planningState.batches || [])
    .filter((batch) => (
      routeIds.has(batch.routeId)
      || batch.specificationId === specificationId
      || batch.projectId === specificationId
    ))
    .map((batch) => batch.id));
  const slotsCount = (planningState.slots || []).filter((slot) => (
    routeIds.has(slot.routeId)
    || routeStepIds.has(slot.routeStepId)
    || batchIds.has(slot.batchId)
    || slot.specificationId === specificationId
    || slot.projectId === specificationId
  )).length;

  return {
    routeIds,
    routeStepIds,
    batchIds,
    routesCount: routeIds.size,
    batchesCount: batchIds.size,
    slotsCount,
  };
}

function deleteSpekiSpecification(specificationId) {
  if (!specificationId) return;
  const usage = getSpecificationDeleteUsage(specificationId);
  recordDirectoryEntityDeletion("specifications", specificationId);
  directoryState.specifications = (directoryState.specifications || [])
    .filter((specification) => specification.id !== specificationId)
    .map((specification) => ({
      ...specification,
      structureItems: getSpecificationStructureItems(specification)
        .filter((item) => item.specificationId !== specificationId),
    }));

  planningState.routes = (planningState.routes || []).filter((route) => !usage.routeIds.has(route.id));
  planningState.routeSteps = (planningState.routeSteps || []).filter((step) => !usage.routeIds.has(step.routeId));
  planningState.batches = (planningState.batches || []).filter((batch) => (
    !usage.routeIds.has(batch.routeId)
    && batch.specificationId !== specificationId
    && batch.projectId !== specificationId
  ));
  planningState.slots = (planningState.slots || []).filter((slot) => (
    !usage.routeIds.has(slot.routeId)
    && !usage.routeStepIds.has(slot.routeStepId)
    && !usage.batchIds.has(slot.batchId)
    && slot.specificationId !== specificationId
    && slot.projectId !== specificationId
  ));

  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  planningState = normalizePlanningState(planningState);
  ui.activeSpecificationId = "";
  ui.activeProjectId = "";
  if (usage.routeIds.has(ui.activeRouteId)) ui.activeRouteId = "";
  if ((planningState.slots || []).every((slot) => slot.id !== ui.selectedSlotId)) ui.selectedSlotId = null;
  ui.expandedProjects?.delete?.(specificationId);
  usage.routeIds.forEach((routeId) => ui.expandedProjects?.delete?.(routeId));
  ui.spekiEditingId = "";
  ui.spekiCheckedSpecificationId = "";
  ui.spekiStaleItemIds = [];
  if (calculatorState.specificationId === specificationId || calculatorState.projectId === specificationId) {
    calculatorState = normalizeCalculatorState({
      ...calculatorState,
      projectId: "",
      specificationId: "",
      bomListId: "",
      noSpecification: false,
      routeOperations: [],
      selectedOperationId: "",
      inputsSavedAt: "",
    });
  }
  withPlanningEntityRemovalAllowed(() => persistState());
  withDirectoryEntityRemovalAllowed(() => persistDirectoryState());
  persistCalculatorState();
  persistUiState();
  render();
}

function moveSpecificationStructureItem(itemId, direction) {
  if (!itemId || !direction) return;
  updateSpecificationStructure((items) => {
    const index = items.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return items;
    const nextItems = [...items];
    [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
    return nextItems;
  });
}

function deleteSpecificationStructureItem(itemId) {
  if (!itemId) return;
  clearSpekiStaleItem(itemId);
  ui.spekiCollapsedBomIds = (ui.spekiCollapsedBomIds || []).filter((id) => id !== itemId);
  updateSpecificationStructure((items) => items
    .filter((item) => item.id !== itemId)
    .map((item) => item.parentId === itemId ? { ...item, parentId: "root" } : item));
}

function bindNomenclatureEvents() {
  app.querySelectorAll("[data-nomenclature-create]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.activeNomenclatureId = "__new__";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-nomenclature-type-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.nomenclatureTypeFilter = button.dataset.nomenclatureTypeFilter || "all";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-dense-nomenclature-type] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const value = button.dataset.denseValue || NOMENCLATURE_REA_COMPONENT_TYPE;
      const hidden = app.querySelector("[data-nomenclature-type-hidden]");
      const root = button.closest("[data-dense-nomenclature-type]");
      if (hidden) {
        hidden.value = value;
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
      }
      root?.querySelector("summary strong")?.replaceChildren(document.createTextNode(button.querySelector("strong")?.textContent || value));
      root?.querySelector("summary small")?.replaceChildren(document.createTextNode(button.querySelector("small")?.textContent || ""));
      root?.removeAttribute("open");
    });
  });

  app.querySelectorAll("[data-nomenclature-open], [data-nomenclature-row-open]").forEach((element) => {
    element.addEventListener("click", () => {
      ui.activeNomenclatureId = element.dataset.nomenclatureOpen || element.dataset.nomenclatureRowOpen || "";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-nomenclature-delete], [data-nomenclature-row-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const itemId = button.dataset.nomenclatureDelete || button.dataset.nomenclatureRowDelete || "";
      if (!itemId) return;
      openConfirmDialog("nomenclatureDeleteItem", { itemId });
    });
  });

  app.querySelector("#nomenclatureForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNomenclatureForm(event.currentTarget);
  });
}

function saveNomenclatureForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const id = isNew ? makeId("nom") : String(data.get("itemId") || makeId("nom"));
  const name = String(data.get("name") || "").trim();
  if (!name) {
    alert("Заполните наименование позиции номенклатуры.");
    return;
  }
  const customType = String(data.get("customType") || "").trim();
  const type = normalizeNomenclatureType(customType || data.get("type"));
  ensureNomenclatureTypeExists(type);

  const row = normalizeDirectoryRow("nomenclature", {
    id,
    name,
    article: String(data.get("article") || "").trim(),
    type,
    package: String(data.get("package") || "").trim(),
    unit: String(data.get("unit") || "шт.").trim(),
    manufacturer: String(data.get("manufacturer") || "").trim(),
    description: String(data.get("description") || "").trim(),
    status: String(data.get("status") || "Активен").trim(),
    updatedAt: new Date().toISOString(),
  });

  directoryState.nomenclature = isNew
    ? [...(directoryState.nomenclature || []), row]
    : (directoryState.nomenclature || []).map((item) => item.id === id ? { ...item, ...row } : item);
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ui.activeNomenclatureId = id;
  ui.nomenclatureTypeFilter = type;
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess(isNew ? "Позиция номенклатуры создана" : "Позиция номенклатуры сохранена");
  render();
}

function deleteNomenclatureItem(itemId) {
  const item = getNomenclatureItem(itemId);
  if (!item) return;

  deleteDirectoryStateRow("nomenclature", item);
  persistDirectoryState();
  persistCalculatorState();
  persistUiState();
  render();
}

function bindBomListsEvents() {
  app.querySelector("[data-bom-create]")?.addEventListener("click", () => {
    ui.activeBomId = "__new__";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-bom-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const bom = getBomList(button.dataset.bomOpen);
      if (!bom) return;
      ui.activeBomId = bom.id;
      ui.activeProjectId = bom.projectId || ui.activeProjectId || "";
      persistUiState();
      render();
    });
  });

  app.querySelector("#bomModuleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBomModuleForm(event.currentTarget);
  });

  app.querySelector("[data-bom-delete]")?.addEventListener("click", (event) => {
    openConfirmDialog("bomDeleteList", { bomId: event.currentTarget.dataset.bomDelete || "" });
  });

  app.querySelector("[data-bom-import-file]")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await importBomFromXlsxFile(file);
      render();
    } catch (error) {
      alert(error?.message || "Не удалось импортировать BOM из Excel.");
    } finally {
      event.target.value = "";
    }
  });

  app.querySelectorAll("[data-bom-import-cell]").forEach((field) => {
    field.addEventListener("change", () => {
      updateBomImportCell(
        field.dataset.bomImportCell,
        Number(field.dataset.bomRowIndex),
        Number(field.dataset.bomColumnIndex),
        field.value,
      );
      render();
    });
  });

  app.querySelectorAll("[data-bom-import-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteBomImportRow(button.dataset.bomImportDelete, Number(button.dataset.bomRowIndex));
      render();
    });
  });

  app.querySelectorAll("[data-dense-bom-nomenclature] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-bom-nomenclature]");
      const nomenclatureId = button.dataset.denseValue || "";
      if (!root || !nomenclatureId) return;
      addNomenclatureToBom(root.dataset.denseBomNomenclature, nomenclatureId);
      render();
    });
  });

}

function saveSpecificationModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const id = isNew ? makeId("spec") : String(data.get("specificationId") || makeId("spec"));
  const previousSpecification = (directoryState.specifications || []).find((item) => item.id === id);
  const name = String(data.get("name") || "").trim();
  const productionQuantity = normalizeOptionalPositiveInteger(data.get("productionQuantity"));
  if (!name || !productionQuantity) {
    alert("Заполните название спецификации и количество к производству.");
    return;
  }

  let row = {
    id,
    name,
    projectId: "",
    outputItem: String(data.get("outputItem") || "").trim(),
    productionQuantity,
    dueDate: String(data.get("dueDate") || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000))),
    orderNumber: String(data.get("orderNumber") || "").trim(),
    customer: String(data.get("customer") || "").trim(),
    productionStatus: PROJECT_STATUSES.includes(data.get("productionStatus")) ? String(data.get("productionStatus")) : "planned",
    bomListA: String(data.get("bomListA") || ""),
    bomQtyA: Math.max(0, Number(data.get("bomQtyA") || 0)),
    bomListB: String(data.get("bomListB") || ""),
    bomQtyB: Math.max(0, Number(data.get("bomQtyB") || 0)),
    extraItems: String(data.get("extraItems") || "").trim(),
    status: String(data.get("status") || "Черновик").trim(),
    structureManaged: Boolean(previousSpecification?.structureManaged),
    structureItems: previousSpecification?.structureManaged ? getSpecificationStructureItems(previousSpecification) : [],
    updatedAt: new Date().toISOString(),
  };
  ensureSpecificationPlanningUnit(row, String(data.get("routeTemplate") || "full"));
  if (!row.structureManaged) {
    row.structureItems = buildDefaultSpecificationStructureItems(row);
  }
  row = syncSpecificationDerivedFields(row);

  directoryState.specifications = isNew
    ? [...(directoryState.specifications || []), row]
    : (directoryState.specifications || []).map((item) => item.id === id ? { ...item, ...row } : item);
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ui.activeSpecificationId = id;
  ui.activeProjectId = row.id;
  if (row.bomListA) ui.activeBomId = row.bomListA;
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess(isNew ? "Спецификация создана" : "Спецификация сохранена");
  render();
}

function saveBomModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const id = isNew ? makeId("bom") : String(data.get("bomId") || makeId("bom"));
  const previousBom = getBomList(id);
  const name = String(data.get("name") || "").trim();
  const boardCode = String(data.get("boardCode") || "").trim();
  const resultItem = String(data.get("resultItem") || "").trim() || `Печатная плата ${boardCode || name}`;
  if (!name) {
    alert("Заполните название BOM.");
    return;
  }

  const row = {
    id,
    name,
    projectId: "",
    boardCode,
    resultItem,
    status: String(previousBom?.status || "Черновик").trim(),
    importHeaders: previousBom?.importHeaders || [],
    importRows: previousBom?.importRows || [],
    importedAt: previousBom?.importedAt || "",
    sourceFileName: previousBom?.sourceFileName || "",
    sourceSheetName: previousBom?.sourceSheetName || "",
    updatedAt: new Date().toISOString(),
  };
  for (const field of BOM_COMPONENT_FIELDS) {
    row[field.key] = data.has(field.key)
      ? Math.max(0, Number(data.get(field.key) || 0))
      : Math.max(0, Number(previousBom?.[field.key] || 0));
  }

  directoryState.bomLists = isNew
    ? [...(directoryState.bomLists || []), row]
    : (directoryState.bomLists || []).map((item) => item.id === id ? { ...item, ...row } : item);

  upsertBomResultToNomenclature(row, row.updatedAt);
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ui.activeBomId = id;
  ui.activeProjectId = "";
  persistDirectoryState();
  persistUiState();
  notifySaveSuccess(isNew ? "BOM создан" : "BOM сохранен");
  render();
}

function deleteBomList(bomId) {
  const bom = getBomList(bomId);
  if (!bom) return;

  deleteDirectoryStateRow("bomLists", bom);
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  ui.activeBomId = "";
  if (calculatorState.bomListId === bomId) {
    calculatorState = normalizeCalculatorState({
      ...calculatorState,
      bomListId: "",
      componentCounts: {},
      componentCountsByOperation: {},
      inputsSavedAt: "",
    });
  }

  withDirectoryEntityRemovalAllowed(() => persistDirectoryState());
  persistCalculatorState();
  persistUiState();
  render();
}

function openProjectInCalculator(projectId, specificationId = "") {
  const project = getProject(projectId || specificationId);
  if (!project) return;
  const specification = specificationId
    ? (directoryState.specifications || []).find((item) => item.id === specificationId)
    : getProjectSpecification(project.id);
  const bom = specification
    ? getSpecificationBomEntries(specification.id)[0]?.bom
    : (directoryState.bomLists || []).find((item) => item.projectId === project.id);
  calculatorState = normalizeCalculatorState({
    ...calculatorState,
    projectId: project.id,
    specificationId: specification?.id || "",
    noSpecification: !specification,
    bomListId: bom?.id || "",
    boardQuantity: normalizeOptionalPositiveInteger(project.totalQuantity),
    routeOperations: [],
    selectedOperationId: "",
    componentCounts: bom ? getBomComponentCounts(bom) : {},
    componentCountsByOperation: {},
    inputsSavedAt: "",
    lastSavedAt: "",
  });
  ui.activeModule = "calculator";
  ui.calculatorStep = "inputs";
  persistCalculatorState();
  persistUiState();
  render();
}

function bindCalculatorEvents() {
  const commitCalculatorSelect = (key, value) => {
    calculatorState[key] = value;
    calculatorState.inputsSavedAt = "";

    if (key === "projectId") {
      calculatorState.specificationId = "";
      calculatorState.noSpecification = false;
      calculatorState.bomListId = "";
      calculatorState.routeOperations = [];
      calculatorState.selectedOperationId = "";
      calculatorState.componentCounts = {};
      calculatorState.componentCountsByOperation = {};
      calculatorState.lastSavedAt = "";
    }

    if (key === "specificationId") {
      const specification = (directoryState.specifications || []).find((item) => item.id === value);
      if (specification?.projectId) calculatorState.projectId = specification.projectId;
      calculatorState.noSpecification = false;
      calculatorState.bomListId = "";
      calculatorState.routeOperations = [];
      calculatorState.selectedOperationId = "";
      calculatorState.componentCounts = {};
      calculatorState.componentCountsByOperation = {};
      calculatorState.lastSavedAt = "";
    }

    if (key === "bomListId") {
      const selectedBom = getBomList(value);
      calculatorState.componentCounts = selectedBom ? getBomComponentCounts(selectedBom) : {};
      calculatorState.componentCountsByOperation = {};
      calculatorState.routeOperations = [];
      calculatorState.selectedOperationId = "";
      calculatorState.lastSavedAt = "";
    }

    if (key === "resourceId") {
      const selectedLine = getSmtLineConfigurations().find((line) => line.id === value);
      calculatorState.efficiency = Math.round(Number(selectedLine?.efficiency || calculatorState.efficiency || defaultCalculatorState.efficiency));
      calculatorState.routeOperations = [];
      calculatorState.selectedOperationId = "";
      calculatorState.lastSavedAt = "";
    }

    calculatorState = normalizeCalculatorState(calculatorState);
    ui.calculatorStep = getNextCalculatorStep();
    persistCalculatorState();
    persistUiState();
    render();
  };

  app.querySelectorAll("[data-calculator-step]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.calculatorStep = button.dataset.calculatorStep || "inputs";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-dense-calc-select] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-calc-select]");
      if (!root) return;
      if (button.dataset.denseAction === "createProject") {
        ui.projectModal = true;
        persistUiState();
        render();
        return;
      }
      if (button.dataset.denseAction === "createSpecification") {
        ui.activeModule = "speki";
        ui.activeSpecificationId = "__new__";
        persistUiState();
        render();
        return;
      }
      commitCalculatorSelect(root.dataset.denseCalcSelect, button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-dense-route-op-field] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-route-op-field]");
      if (!root) return;
      updateSelectedRouteOperation(root.dataset.denseRouteOpField, button.dataset.denseValue || "");
    });
  });

  app.querySelectorAll("[data-calc-select]").forEach((field) => {
    field.addEventListener("change", () => {
      commitCalculatorSelect(field.dataset.calcSelect, field.value);
    });
  });

  app.querySelectorAll("[data-calc-number]").forEach((field) => {
    const updateNumberState = (shouldRender) => {
      const key = field.dataset.calcNumber;
      calculatorState[key] = Number(field.value || 0);
      if (key === "boardsPerPanel") {
        calculatorState.routeOperations = getRouteOperations().map((operation) => ({
          ...operation,
          secondsPerPanel: operation.calculationType === "components"
            ? 0
            : Number(operation.secondsPerPanel || getDefaultSecondsPerPanel(operation.workCenterId, calculatorState.boardsPerPanel)),
        }));
      }
      calculatorState.inputsSavedAt = "";
      calculatorState.lastSavedAt = "";
      calculatorState = normalizeCalculatorState(calculatorState);
      ui.calculatorStep = getNextCalculatorStep();
      persistCalculatorState();
      persistUiState();
      if (shouldRender) {
        render();
      } else {
        refreshCalculatorActionStates();
      }
    };
    field.addEventListener("input", () => updateNumberState(false));
    field.addEventListener("change", () => updateNumberState(true));
  });

  app.querySelector("[data-calculator-no-specification]")?.addEventListener("change", (event) => {
    calculatorState.noSpecification = event.target.checked;
    calculatorState.specificationId = "";
    calculatorState.bomListId = "";
    calculatorState.routeOperations = [];
    calculatorState.selectedOperationId = "";
    calculatorState.componentCounts = {};
    calculatorState.componentCountsByOperation = {};
    calculatorState.inputsSavedAt = "";
    calculatorState.lastSavedAt = "";
    calculatorState = normalizeCalculatorState(calculatorState);
    ui.calculatorStep = getNextCalculatorStep();
    persistCalculatorState();
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-select-route-operation]").forEach((button) => {
    button.addEventListener("click", () => {
      calculatorState.selectedOperationId = button.dataset.selectRouteOperation;
      ui.calculatorStep = "operation";
      persistCalculatorState();
      persistUiState();
      render();
    });
    button.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      calculatorState.selectedOperationId = button.dataset.selectRouteOperation;
      ui.calculatorStep = "operation";
      persistCalculatorState();
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-route-op-field]").forEach((field) => {
    field.addEventListener("change", () => {
      updateSelectedRouteOperation(field.dataset.routeOpField, field.value);
    });
  });

  app.querySelectorAll("[data-route-op-number]").forEach((field) => {
    field.addEventListener("change", () => {
      updateSelectedRouteOperation(field.dataset.routeOpNumber, Number(field.value || 0));
    });
  });

  app.querySelectorAll("[data-component-count]").forEach((field) => {
    field.addEventListener("change", () => {
      const componentId = field.dataset.componentCount;
      const operationId = calculatorState.selectedOperationId;
      const previous = calculatorState.componentCountsByOperation?.[operationId] || getDefaultComponentCounts();
      calculatorState.componentCountsByOperation = {
        ...(calculatorState.componentCountsByOperation || {}),
        [operationId]: {
          ...previous,
          [componentId]: Math.max(0, Math.round(Number(field.value || 0))),
        },
      };
      calculatorState.componentCounts = {
        ...getDefaultComponentCounts(),
        ...(calculatorState.componentCountsByOperation[operationId] || {}),
        [componentId]: Math.max(0, Math.round(Number(field.value || 0))),
      };
      persistCalculatorState();
      render();
    });
  });

  app.querySelector("[data-calculator-reset]")?.addEventListener("click", () => {
    openConfirmDialog("calculatorResetRoute");
  });

  app.querySelector("[data-calculator-build-route]")?.addEventListener("click", () => {
    buildCalculatorRouteFromTemplate();
  });

  app.querySelector("[data-add-route-operation]")?.addEventListener("click", () => {
    addRouteOperation();
  });

  app.querySelector("[data-delete-route-operation]")?.addEventListener("click", () => {
    requestDeleteSelectedRouteOperation();
  });

  app.querySelectorAll("[data-calculator-save-route]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("calculatorSaveRoute");
    });
  });

  app.querySelector("[data-save-calculator-inputs]")?.addEventListener("click", () => {
    saveCalculatorInputs();
  });

  app.querySelectorAll("[data-load-calculator-project]").forEach((button) => {
    button.addEventListener("click", () => {
      loadCalculatorProjectBinding(button.dataset.loadCalculatorProject, button.dataset.loadCalculatorSpecification || "");
    });
  });

  app.querySelectorAll("[data-close-modal], [data-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-close-modal]")) return;
      ui.projectModal = false;
      render();
    });
  });

  refreshCalculatorActionStates();
  bindProjectForm();
}

function applySpecificationBomsToComponentOperations() {
  const operations = getRouteOperations();
  const selectedBom = getBomList(calculatorState.bomListId);
  const bomEntries = calculatorState.noSpecification && selectedBom
    ? [{ bom: selectedBom, quantity: 1, boardsPerPanel: calculatorState.boardsPerPanel || 1, slot: "PCB" }]
    : getSpecificationBomEntries(calculatorState.specificationId);
  const fallbackBom = selectedBom || bomEntries[0]?.bom || null;
  const entryByBomId = new Map(bomEntries.map((entry) => [entry.bom?.id, entry]));
  const nextCounts = { ...(calculatorState.componentCountsByOperation || {}) };
  const nextOperations = operations.map((operation) => {
    const entry = operation.bomListId ? entryByBomId.get(operation.bomListId) : null;
    if (!entry) return operation;
    return {
      ...operation,
      quantityMultiplier: entry.quantity || operation.quantityMultiplier || 1,
      boardsPerPanel: normalizeBoardsPerPanel(entry.boardsPerPanel, operation.boardsPerPanel || calculatorState.boardsPerPanel || 1),
    };
  });

  nextOperations
    .filter((operation) => operation.calculationType === "components")
    .forEach((operation) => {
      const bom = getBomList(operation.bomListId) || fallbackBom;
      if (!bom) return;
      nextCounts[operation.id] = getBomComponentCounts(bom);
    });

  calculatorState.routeOperations = nextOperations;
  calculatorState.componentCountsByOperation = nextCounts;
  calculatorState.componentCounts = fallbackBom ? getBomComponentCounts(fallbackBom) : {};
  calculatorState.selectedOperationId = operations[0]?.id || "";
}

function applyBomToComponentOperation() {
  applySpecificationBomsToComponentOperations();
}

function createCalculatorSpecification() {
  const project = getCalculatorProject();
  if (!project) {
    alert("Сначала выберите или создайте спецификацию.");
    return;
  }

  const bom = getBomList(calculatorState.bomListId)
    || getCalculatorBomSource(project, null, true)[0]
    || getCalculatorBomSource(project, getProjectSpecification(project.id), false)[0]
    || null;
  const specification = {
    id: makeId("spec"),
    name: `СП ${project.name}`,
    projectId: project.id,
    outputItem: project.name,
    bomListA: bom?.id || "",
    bomQtyA: bom ? 1 : 0,
    bomListB: "",
    bomQtyB: 0,
    extraItems: "",
    status: "Черновик",
  };

  directoryState.specifications = [...(directoryState.specifications || []), specification];
  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  calculatorState.specificationId = specification.id;
  calculatorState.noSpecification = false;
  calculatorState.bomListId = bom?.id || "";
  calculatorState.routeOperations = [];
  calculatorState.selectedOperationId = "";
  calculatorState.inputsSavedAt = "";
  calculatorState.lastSavedAt = "";
  calculatorState = normalizeCalculatorState(calculatorState);
  persistDirectoryState();
  persistCalculatorState();
  render();
}

function saveCalculatorInputs() {
  const calc = calculateComplexityResult();
  const inputStatus = getCalculatorInputStatus(calc);
  if (!inputStatus.complete) {
    alert("Выберите BOM-лист, SMT-линию, количество плат и плат в мультипликации.");
    return;
  }

  const stamp = new Date().toISOString();
  calculatorState.inputsSavedAt = stamp;
  calculatorState.lastSavedAt = "";
  calculatorState = normalizeCalculatorState(calculatorState);
  calculatorState.inputsSavedSignature = getCalculatorInputsSignature();
  persistCalculatorState();
  notifySaveSuccess("Входные данные сохранены");
  render();
}

function getNextCalculatorStep() {
  const calc = calculateComplexityResult();
  const workflow = getCalculatorWorkflow(calc);
  return workflow.find((step) => !step.complete && !step.locked)?.id || workflow[workflow.length - 1]?.id || "inputs";
}

function buildCalculatorRouteFromTemplate() {
  if (!isCalculatorInputsComplete()) {
    alert("Заполните спецификацию, BOM при наличии печатных плат, количество плат и плат в мультипликации перед формированием маршрута.");
    return;
  }
  calculatorState.routeOperations = createDefaultRouteOperations(calculatorState.projectId, calculatorState.boardsPerPanel);
  calculatorState.selectedOperationId = calculatorState.routeOperations[0]?.id || "";
  calculatorState.lastSavedAt = "";
  calculatorState = normalizeCalculatorState(calculatorState);
  applySpecificationBomsToComponentOperations();
  ui.calculatorStep = "route";
  persistCalculatorState();
  persistUiState();
  render();
}

function loadCalculatorProjectBinding(projectId, specificationId = "") {
  const specification = (directoryState.specifications || []).find((item) => item.id === specificationId)
    || getProjectSpecification(projectId);
  const project = getProject(projectId || specification?.id);
  if (!project || !specification) return;
  const bom = getSpecificationBomEntries(specification?.id)[0]?.bom || null;
  calculatorState = normalizeCalculatorState({
    ...calculatorState,
    projectId: project.id,
    noSpecification: false,
    specificationId: specification?.id || "",
    bomListId: bom?.id || "",
    boardQuantity: normalizeOptionalPositiveInteger(project.totalQuantity),
    routeOperations: [],
    selectedOperationId: "",
    componentCounts: bom ? getBomComponentCounts(bom) : {},
    componentCountsByOperation: {},
    lastSavedAt: "",
  });
  ui.calculatorStep = getNextCalculatorStep();
  persistCalculatorState();
  persistUiState();
  render();
}

function refreshCalculatorActionStates() {
  const inputComplete = isCalculatorInputsComplete();
  const routeReady = inputComplete && getRouteOperations().length > 0;
  const inputsDirty = isCalculatorInputsDirty();
  const routeDirty = isCalculatorRouteDirty();
  app.querySelector("[data-calculator-build-route]")?.toggleAttribute("disabled", !inputComplete);
  const inputsSaveButton = app.querySelector("[data-save-calculator-inputs]");
  setSaveButtonDisabled(inputsSaveButton, !inputComplete || !inputsDirty);
  app.querySelector("[data-add-route-operation]")?.toggleAttribute("disabled", !inputComplete);
  app.querySelector("[data-calculator-reset]")?.toggleAttribute("disabled", !routeReady);
  app.querySelectorAll("[data-calculator-save-route]").forEach((button) => {
    setSaveButtonDisabled(button, !routeReady || !routeDirty);
  });
  const panelCountField = app.querySelector(".calculator-input-panel .field.readonly input");
  if (panelCountField) {
    const boardQuantity = Number(calculatorState.boardQuantity || 0);
    const boardsPerPanel = Number(calculatorState.boardsPerPanel || 0);
    panelCountField.value = boardQuantity > 0 && boardsPerPanel > 0
      ? `${Math.ceil(boardQuantity / boardsPerPanel).toLocaleString("ru-RU")} шт.`
      : "0 шт.";
  }
}

function updateSelectedRouteOperation(key, value) {
  const operationId = calculatorState.selectedOperationId;
  const operations = getRouteOperations();
  if (!operationId || !operations.length) return;
  calculatorState.routeOperations = operations.map((operation) => {
    if (operation.id !== operationId) return operation;
    const next = { ...operation, [key]: value };
    if (key === "workCenterId") {
	      const resource = getResourcesForWorkCenter(value)[0];
	      next.resourceId = resource?.id || "";
	      next.operationName = operation.operationName || getWorkCenter(value)?.name || "Операция";
	      next.calculationType = getDefaultOperationCalculationType(value, next);
	      next.secondsPerPanel = next.calculationType === "manual" || next.calculationType === "normative"
	        ? getDefaultSecondsPerPanel(value, calculatorState.boardsPerPanel)
	        : 0;
	      next.setupMin = Number(resource?.changeoverMin || 0);
	    }
    if (key === "calculationType" && value === "components") {
      calculatorState.componentCountsByOperation = {
        ...(calculatorState.componentCountsByOperation || {}),
        [operationId]: getOperationComponentCounts(operationId),
      };
    }
    return next;
  });
  calculatorState.lastSavedAt = "";
  calculatorState = normalizeCalculatorState(calculatorState);
  persistCalculatorState();
  render();
}

function addRouteOperation() {
  if (!isCalculatorInputsComplete()) {
    alert("Сначала заполните входные данные калькулятора.");
    return;
  }
  const operations = getRouteOperations();
  const last = operations[operations.length - 1];
  const workCenterId = "manual";
  const resource = getResourcesForWorkCenter(workCenterId)[0];
  const operation = normalizeRouteOperation({
    id: makeId("op"),
    stepOrder: Number(last?.stepOrder || operations.length) + 1,
    operationName: "Новая операция",
    workCenterId,
    resourceId: resource?.id || "",
    calculationType: "manual",
    secondsPerPanel: getDefaultSecondsPerPanel(workCenterId, calculatorState.boardsPerPanel),
    setupMin: Number(resource?.changeoverMin || 0),
    comment: "",
  }, operations.length + 1, calculatorState.boardsPerPanel);
  calculatorState.routeOperations = [...operations, operation];
  calculatorState.selectedOperationId = operation.id;
  calculatorState.lastSavedAt = "";
  calculatorState = normalizeCalculatorState(calculatorState);
  ui.calculatorStep = "operation";
  persistCalculatorState();
  persistUiState();
  render();
}

function resetCalculatorRoute() {
  if (!isCalculatorInputsComplete()) {
    alert("Сначала заполните входные данные калькулятора.");
    return;
  }
  const project = getCalculatorProject();
  calculatorState = normalizeCalculatorState({
    ...calculatorState,
    routeOperations: createDefaultRouteOperations(project?.id, calculatorState.boardsPerPanel),
    selectedOperationId: null,
    componentCountsByOperation: {},
    componentCounts: getBomComponentCounts(getBomList(calculatorState.bomListId)),
    lastSavedAt: "",
  });
  applySpecificationBomsToComponentOperations();
  ui.calculatorStep = "route";
  persistCalculatorState();
  persistUiState();
  render();
}

function requestDeleteSelectedRouteOperation() {
  const operations = getRouteOperations();
  if (!operations.length || !calculatorState.selectedOperationId) return;
  if (operations.length <= 1) {
    alert("В маршрутной карте должна остаться хотя бы одна операция.");
    return;
  }
  openConfirmDialog("calculatorDeleteOperation", { operationId: calculatorState.selectedOperationId });
}

function deleteSelectedRouteOperation() {
  const operations = getRouteOperations();
  const filtered = operations
    .filter((operation) => operation.id !== calculatorState.selectedOperationId)
    .map((operation, index) => ({ ...operation, stepOrder: index + 1 }));
  calculatorState.routeOperations = filtered;
  calculatorState.selectedOperationId = filtered[0]?.id;
  calculatorState.lastSavedAt = "";
  ui.calculatorStep = filtered[0]?.id ? "operation" : "route";
  persistCalculatorState();
  persistUiState();
  render();
}

function saveCalculatorRouteToProject() {
  const calc = calculateComplexityResult();
  if (!isCalculatorInputsComplete() || !calc.operationResults.length) {
    alert("Не удалось сохранить маршрут: заполните входные данные и сформируйте операции.");
    return;
  }

  const stamp = new Date().toISOString();
  let route = planningState.routes.find((item) => (item.specificationId === calc.project.id || item.projectId === calc.project.id) && item.isDefault)
    || planningState.routes.find((item) => item.specificationId === calc.project.id || item.projectId === calc.project.id);

  if (!route) {
    route = {
      id: makeId("r"),
      specificationId: calc.project.id,
      specificationName: calc.specification?.name || calc.project.name || "",
      projectId: calc.project.id,
      name: "Маршрутная карта",
      isDefault: true,
    };
    planningState.routes = [...planningState.routes, route];
  }

  const existingSteps = planningState.routeSteps.filter((step) => step.routeId === route.id);
  const usedStepIds = new Set();
  const nextSteps = calc.operationResults.map((operation, index) => {
    const sameOperation = existingSteps.find((step) => (
      !usedStepIds.has(step.id)
      && step.workCenterId === operation.workCenterId
      && step.operationName === operation.operationName
      && String(step.bomListId || "") === String(operation.bomListId || "")
    ));
    const sameOrder = existingSteps.find((step) => (
      !usedStepIds.has(step.id)
      && step.workCenterId === operation.workCenterId
      && Number(step.stepOrder) === index + 1
    ));
    const existing = sameOperation || sameOrder;
    if (existing?.id) usedStepIds.add(existing.id);
    return {
      id: existing?.id || makeId("rs"),
      routeId: route.id,
      workCenterId: operation.workCenterId,
      operationName: operation.operationName,
      stepOrder: index + 1,
      isRequired: true,
      secondsPerPanel: Math.round(operation.perPanelSeconds),
      setupMin: Math.round(operation.setupMs / 60000),
      calculationType: operation.calculationType,
      resourceId: operation.resource?.id || operation.resourceId || "",
      bomListId: operation.bomListId || "",
      bomSlot: operation.bomSlot || "",
      quantityMultiplier: operation.quantityMultiplier || 1,
      boardsPerPanel: normalizeBoardsPerPanel(operation.boardsPerPanel, calc.boardsPerPanel || 1),
      unitsPerHour: Math.max(1, Math.round(Number(operation.flowBoardsPerHour || 0) * 10) / 10),
      updatedAt: stamp,
    };
  });
  const routeStepIdsByWorkCenter = new Map();
  for (const step of nextSteps) {
    if (!routeStepIdsByWorkCenter.has(step.workCenterId)) {
      routeStepIdsByWorkCenter.set(step.workCenterId, step.id);
    }
  }
  const nextStepIds = new Set(nextSteps.map((step) => step.id));

  planningState.routeSteps = [
    ...planningState.routeSteps.filter((step) => step.routeId !== route.id),
    ...nextSteps,
  ];
  planningState.routes = planningState.routes.map((item) => item.id === route.id
    ? { ...item, specificationId: calc.project.id, specificationName: calc.specification?.name || item.specificationName || "", projectId: calc.project.id, name: "Маршрутная карта", isDefault: true, updatedAt: stamp }
    : item);
  planningState.slots = planningState.slots.map((slot) => (
    (slot.specificationId === calc.project.id || slot.projectId === calc.project.id) && !nextStepIds.has(slot.routeStepId) && routeStepIdsByWorkCenter.has(slot.workCenterId)
      ? { ...slot, routeStepId: routeStepIdsByWorkCenter.get(slot.workCenterId) }
      : slot
  ));
  calculatorState.lastSavedAt = stamp;
  calculatorState.routeSavedSignature = getCalculatorRouteSignature();
  ui.calculatorStep = "save";
  persistState();
  persistCalculatorState();
  persistUiState();
  notifySaveSuccess("Маршрут сохранен");
  render();
}

function applyCalculatorRateToWorkCenter() {
  const calc = calculateComplexityResult();
  const unitsPerHour = Math.max(1, Math.round(calc.flowBoardsPerHour));
  if (!calc.workCenter || !unitsPerHour) {
    alert("Не удалось рассчитать скорость подразделения: проверьте состав платы и ресурс.");
    return;
  }

  planningState.workCenters = planningState.workCenters.map((center) => center.id === calc.workCenter.id
    ? { ...center, unitsPerHour, updatedAt: new Date().toISOString() }
    : center);
  planningState.slots = planningState.slots.map((slot) => slot.workCenterId === calc.workCenter.id
    ? recalculateSlotEndByQuantity(slot, planningState)
    : slot);
  persistState();
  notifySaveSuccess(`Норматив подразделения обновлен: ${unitsPerHour.toLocaleString("ru-RU")} плат/час`);
  render();
}

function applyCalculatorToProjectSlots() {
  const calc = calculateComplexityResult();
  if (!calc.project || !calc.workCenter || calc.perBoardSeconds <= 0) {
    alert("Не удалось применить расчет: выберите спецификацию, подразделение и заполните состав платы.");
    return;
  }

  const targetSlots = planningState.slots.filter((slot) => (
    (slot.specificationId === calc.project.id || slot.projectId === calc.project.id)
    && slot.workCenterId === calc.workCenter.id
    && slot.status !== "completed"
    && !slot.locked
  ));

  if (!targetSlots.length) {
    alert(`В спецификации "${calc.specification?.name || getProjectDisplayName(calc.project)}" нет доступных операций подразделения "${calc.workCenter.name}".`);
    return;
  }

  const stamp = new Date().toISOString();
  const setupMs = calc.setupMs;
  const perBoardMs = calc.perBoardSeconds * 1000;
  const changedIds = new Set(targetSlots.map((slot) => slot.id));

  planningState.slots = planningState.slots.map((slot) => {
    if (!changedIds.has(slot.id)) return slot;
    const durationMs = Math.max(MIN_OPERATION_DURATION_MS, normalizeQuantity(slot.quantity) * perBoardMs + setupMs);
    const slotUnitsPerHour = normalizeQuantity(slot.quantity) / (durationMs / (60 * 60 * 1000));
    return {
      ...slot,
      unitsPerHour: Math.max(1, Math.round(slotUnitsPerHour * 10) / 10),
      plannedEnd: toSlotDateTime(addMs(slot.plannedStart, durationMs)),
      comment: `${slot.comment || ""}${slot.comment ? " " : ""}Расчет сложности: ${formatCalculatorNumber(calc.flowBoardsPerHour)} плат/ч, ${calc.activeComponentCount} типов компонентов.`,
      updatedAt: stamp,
    };
  });

  for (const slot of targetSlots) {
    cascadeIfEnabled(slot.id);
  }

  persistState();
  notifySaveSuccess(`Расчет применен к операциям: ${targetSlots.length}`);
  render();
}

function bindDirectoryForm() {
  const form = app.querySelector("#directoryForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const sectionId = String(data.get("sectionId"));
    const rowIndex = Number(data.get("rowIndex"));
    const rowId = String(data.get("rowId") || makeId("dir"));
    const directoryData = getDirectoryData(sectionId);
    const currentRow = rowIndex >= 0 ? directoryData.rows[rowIndex] : {};
    const nextRow = {
      ...currentRow,
      id: currentRow.id || rowId,
    };

    for (const field of directoryData.fields) {
      if (field.readonly && rowIndex >= 0) continue;
      if (!data.has(field.key)) continue;
      const rawValue = data.get(field.key);
      nextRow[field.key] = field.type === "number" ? Number(rawValue || 0) : String(rawValue || "").trim();
    }

    const primaryKey = directoryData.keys[0];
    if (!String(nextRow[primaryKey] ?? "").trim()) {
      alert(`Заполните поле "${directoryData.columns[0]}".`);
      return;
    }

    saveDirectoryRow(sectionId, rowIndex, nextRow);
    const nextIndex = rowIndex >= 0 ? rowIndex : getDirectoryData(sectionId).rows.length - 1;
    ui.selectedDirectoryRows[sectionId] = Math.max(0, nextIndex);
    ui.directoryEditor = null;
    persistUiState();
    render();
  });
}

function saveDirectoryRow(sectionId, rowIndex, row) {
  if (sectionId === "workCenters") {
    saveWorkCenterDirectoryRow(rowIndex, row);
    persistState();
    persistDirectoryState();
    notifySaveSuccess(rowIndex >= 0 ? "Запись справочника сохранена" : "Запись справочника создана");
    return;
  }

  const rows = directoryState[sectionId] || [];
  const previousTypeName = sectionId === "nomenclatureTypes" && rowIndex >= 0
    ? rows[rowIndex]?.name || ""
    : "";
  const normalizedRow = normalizeDirectoryRow(sectionId, { ...row, id: row.id || makeId(sectionId.slice(0, 3) || "dir") });
  directoryState = {
    ...directoryState,
    [sectionId]: rowIndex >= 0
      ? rows.map((item, index) => index === rowIndex ? normalizedRow : item)
      : [...rows, normalizedRow],
  };

  if (sectionId === "nomenclatureTypes") {
    syncNomenclatureTypeRename(previousTypeName, normalizedRow.name);
    if (normalizeLookupText(ui.nomenclatureTypeFilter) === normalizeLookupText(previousTypeName)) {
      ui.nomenclatureTypeFilter = normalizedRow.name || "all";
    }
    directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  }

  persistDirectoryState();
  notifySaveSuccess(rowIndex >= 0 ? "Запись справочника сохранена" : "Запись справочника создана");
}

function deleteDirectoryRow(sectionId, rowIndex) {
  const directoryData = getDirectoryData(sectionId);
  const index = Number(rowIndex);
  const row = Number.isFinite(index) ? directoryData.rows[index] : null;
  if (!row) return;

  if (sectionId === "workCenters") {
    deleteWorkCenterDirectoryRow(row.id);
  } else {
    deleteDirectoryStateRow(sectionId, row);
  }

  ui.directoryEditor = null;
  const nextRows = getDirectoryData(sectionId).rows;
  ui.selectedDirectoryRows[sectionId] = nextRows.length ? Math.min(index, nextRows.length - 1) : 0;
  if (sectionId === "bomLists" || sectionId === "specifications") {
    withDirectoryEntityRemovalAllowed(() => persistDirectoryState());
  } else {
    persistDirectoryState();
  }
  persistState();
  persistCalculatorState();
  persistUiState();
  render();
}

function deleteDirectoryStateRow(sectionId, row) {
  const rowId = row.id;
  recordDirectoryEntityDeletion(sectionId, rowId);
  directoryState = {
    ...directoryState,
    [sectionId]: (directoryState[sectionId] || []).filter((item) => item.id !== rowId),
  };

  if (sectionId === "departments") {
    directoryState.employees = (directoryState.employees || []).map((employee) => (
      employee.department === row.name ? { ...employee, department: "" } : employee
    ));
  }

  if (sectionId === "roles") {
    const fallbackRoleId = (directoryState.roles || []).find((role) => role.id !== rowId)?.id || "";
    directoryState.employees = (directoryState.employees || []).map((employee) => (
      employee.roleId === rowId ? { ...employee, roleId: fallbackRoleId } : employee
    ));
  }

  if (sectionId === "resources" || sectionId === "productionResources") {
    if (calculatorState.resourceId === rowId) calculatorState.resourceId = "";
    calculatorState.routeOperations = (calculatorState.routeOperations || []).map((operation) => (
      operation.resourceId === rowId ? { ...operation, resourceId: "" } : operation
    ));
    planningState.routeSteps = (planningState.routeSteps || []).map((step) => (
      step.resourceId === rowId ? { ...step, resourceId: "", updatedAt: new Date().toISOString() } : step
    ));
    planningState.slots = (planningState.slots || []).map((slot) => (
      slot.resourceId === rowId ? { ...slot, resourceId: "", updatedAt: new Date().toISOString() } : slot
    ));
  }

  if (sectionId === "bomLists") {
    if (calculatorState.bomListId === rowId) calculatorState.bomListId = "";
    calculatorState.routeOperations = (calculatorState.routeOperations || []).map((operation) => (
      operation.bomListId === rowId ? { ...operation, bomListId: "", calculationType: "manual" } : operation
    ));
    directoryState.specifications = (directoryState.specifications || []).map((specification) => syncSpecificationDerivedFields({
      ...specification,
      bomListA: specification.bomListA === rowId ? "" : specification.bomListA,
      bomQtyA: specification.bomListA === rowId ? 0 : specification.bomQtyA,
      bomListB: specification.bomListB === rowId ? "" : specification.bomListB,
      bomQtyB: specification.bomListB === rowId ? 0 : specification.bomQtyB,
      structureItems: getSpecificationStructureItems(specification).map((item) => (
        item.bomListId === rowId ? { ...item, bomListId: "" } : item
      )),
    }));
  }

  if (sectionId === "specifications") {
    const usage = getSpecificationDeleteUsage(rowId);
    directoryState.specifications = (directoryState.specifications || []).map((specification) => ({
      ...specification,
      structureItems: getSpecificationStructureItems(specification)
        .filter((item) => item.specificationId !== rowId),
    }));
    planningState.routes = (planningState.routes || []).filter((route) => !usage.routeIds.has(route.id));
    planningState.routeSteps = (planningState.routeSteps || []).filter((step) => !usage.routeIds.has(step.routeId));
    planningState.batches = (planningState.batches || []).filter((batch) => (
      !usage.routeIds.has(batch.routeId)
      && batch.specificationId !== rowId
      && batch.projectId !== rowId
    ));
    planningState.slots = (planningState.slots || []).filter((slot) => (
      !usage.routeIds.has(slot.routeId)
      && !usage.routeStepIds.has(slot.routeStepId)
      && !usage.batchIds.has(slot.batchId)
      && slot.specificationId !== rowId
      && slot.projectId !== rowId
    ));
    if (ui.activeSpecificationId === rowId) ui.activeSpecificationId = "";
    if (usage.routeIds.has(ui.activeRouteId)) ui.activeRouteId = "";
    if ((planningState.slots || []).every((slot) => slot.id !== ui.selectedSlotId)) ui.selectedSlotId = null;
    ui.expandedProjects?.delete?.(rowId);
    usage.routeIds.forEach((routeId) => ui.expandedProjects?.delete?.(routeId));
    if (calculatorState.specificationId === rowId) calculatorState.specificationId = "";
  }

  if (sectionId === "nomenclature") {
    if (ui.activeNomenclatureId === rowId) ui.activeNomenclatureId = "";
    directoryState.bomLists = (directoryState.bomLists || []).map((bom) => ({
      ...bom,
      importRows: getBomImportRows(bom).map((item) => (
        item.nomenclatureId === rowId ? { ...item, nomenclatureId: "" } : item
      )),
    }));
    directoryState.specifications = (directoryState.specifications || []).map((specification) => ({
      ...specification,
      structureItems: getSpecificationStructureItems(specification).map((item) => (
        item.nomenclatureId === rowId ? { ...item, nomenclatureId: "" } : item
      )),
    }));
  }

  if (sectionId === "nomenclatureTypes") {
    const fallbackType = getFallbackNomenclatureType(row.name);
    directoryState.nomenclature = (directoryState.nomenclature || []).map((item) => (
      normalizeLookupText(item.type) === normalizeLookupText(row.name)
        ? { ...item, type: fallbackType, updatedAt: new Date().toISOString() }
        : item
    ));
    if (normalizeLookupText(ui.nomenclatureTypeFilter) === normalizeLookupText(row.name)) {
      ui.nomenclatureTypeFilter = fallbackType || "all";
    }
  }

  if (sectionId === "employees" && authState.employeeId === rowId) {
    authState = { employeeId: "", loggedInAt: "" };
    persistAuthState();
  }

  directoryState = normalizeDirectoryState(directoryState, { mergeFallback: false });
  calculatorState = normalizeCalculatorState(calculatorState);
}

function deleteWorkCenterDirectoryRow(workCenterId) {
  if (!workCenterId) return;
  const removedCenter = planningState.workCenters.find((center) => center.id === workCenterId);
  const removedStepIds = new Set(planningState.routeSteps
    .filter((step) => step.workCenterId === workCenterId)
    .map((step) => step.id));
  planningState.workCenters = planningState.workCenters.filter((center) => center.id !== workCenterId);
  planningState.routeSteps = planningState.routeSteps.filter((step) => step.workCenterId !== workCenterId);
  planningState.slots = planningState.slots.filter((slot) => slot.workCenterId !== workCenterId && !removedStepIds.has(slot.routeStepId));
  calculatorState.routeOperations = (calculatorState.routeOperations || []).filter((operation) => operation.workCenterId !== workCenterId);
  if (removedCenter?.name) updateDepartmentNameReferences(removedCenter.name, "");
  planningState = normalizePlanningState(planningState);
  calculatorState = normalizeCalculatorState(calculatorState);
}

function saveWorkCenterDirectoryRow(rowIndex, row) {
  const previousCenter = rowIndex >= 0 ? planningState.workCenters[rowIndex] : null;
  const isPlanningUnit = row.planningStatus !== "no";
  const normalizedCenter = normalizeWorkCenterUnit({
    id: row.id || makeId("wc"),
    name: row.name || "Новое подразделение",
    code: row.code || "NEW",
    unitType: normalizeUnitType(row.unitType, row),
    isPlanningUnit,
    showInGantt: isPlanningUnit,
    unitsPerHour: isPlanningUnit ? Math.max(1, Number(row.unitsPerHour || 40)) : 0,
    capacity: isPlanningUnit ? Math.max(1, Number(row.capacity || 1)) : 0,
    shift: isPlanningUnit ? row.shift || "5/2 08:00-20:00" : row.shift || "",
    owner: row.owner || "",
    description: row.description || "",
    isActive: row.status !== "inactive",
  });

  planningState.workCenters = rowIndex >= 0
    ? planningState.workCenters.map((center, index) => index === rowIndex ? normalizedCenter : center)
    : [...planningState.workCenters, normalizedCenter];
  if (previousCenter?.name && previousCenter.name !== normalizedCenter.name) {
    updateDepartmentNameReferences(previousCenter.name, normalizedCenter.name);
  }
}

function updateDepartmentNameReferences(previousName = "", nextName = "") {
  if (!previousName) return;
  directoryState.employees = (directoryState.employees || []).map((employee) => (
    employee.department === previousName ? { ...employee, department: nextName, updatedAt: new Date().toISOString() } : employee
  ));
  directoryState.specifications = (directoryState.specifications || []).map((specification) => {
    let changed = false;
    const structureItems = getSpecificationStructureItems(specification).map((item) => {
      if (item.departmentName !== previousName) return item;
      changed = true;
      return { ...item, departmentName: nextName };
    });
    return changed ? { ...specification, structureItems } : specification;
  });
}

function rememberScroll() {
  const shell = app.querySelector("[data-gantt-shell]");
  if (!shell) return;
  ui.scrollLeft = shell.scrollLeft;
  ui.scrollTop = shell.scrollTop;
}

function restoreScroll() {
  const shell = app.querySelector("[data-gantt-shell]");
  if (!shell) return;
  shell.scrollLeft = ui.scrollLeft;
  shell.scrollTop = ui.scrollTop;
  updateDependencyClip(shell);
}

function updateDependencyClip(shell) {
  if (!shell) return;
  app.querySelectorAll(".dependencies-layer, .gantt-snap-overlay").forEach((layer) => {
    layer.style.setProperty("--dependency-clip-left", `${shell.scrollLeft}px`);
  });
}

function updateClockOnly() {
  const clock = app.querySelector("[data-clock]");
  if (clock) clock.textContent = formatDateTime(ui.now);
}

function getGanttWorkCenterFilterOptions() {
  const options = [{ value: "all", label: "Все подразделения", meta: "маршрут целиком" }];
  for (const center of getPlanningWorkCenters()) {
    options.push({ value: center.id, label: center.name, meta: center.code || "подразделение" });
  }
  return options;
}

function renderToolbar(scaleInfo, stats) {
  const allRoutesExpanded = areAllVisibleProjectsExpanded();
  const statusOptions = [
    { value: "all", label: "Все статусы", meta: "портфель" },
    ...PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status], meta: "статус спецификации" })),
  ];

  const workCenterOptions = getGanttWorkCenterFilterOptions();

  return `
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-title">Гант маршрутных карт</div>
        <div class="brand-subtitle">Маршрутная карта как производственное задание</div>
      </div>

      <div class="toolbar-grid">
        <label class="field compact">
          <span>Период</span>
          <input id="periodStart" type="date" value="${ui.windowStart}" />
        </label>

        <div class="segmented" role="group" aria-label="Масштаб времени">
          ${Object.keys(scaleConfig).map((scale) => `
            <button class="segment ${ui.scale === scale ? "is-active" : ""}" data-scale="${scale}" type="button">${scaleConfig[scale].label}</button>
          `).join("")}
        </div>

        <div class="gantt-zoom-control" role="group" aria-label="Масштаб Ганта">
          <button class="icon-button" data-gantt-zoom="out" type="button" title="Уменьшить масштаб Ганта">${icon("minus")}</button>
          <button class="gantt-zoom-value" data-gantt-zoom="reset" type="button" title="Сбросить масштаб">${getGanttZoomPercent()}</button>
          <button class="icon-button" data-gantt-zoom="in" type="button" title="Увеличить масштаб Ганта">${icon("plus")}</button>
        </div>

        <div class="segmented slot-content-mode" role="group" aria-label="Содержимое колбаски">
          ${GANTT_SLOT_CONTENT_MODES.map((mode) => `
            <button class="segment ${ui.ganttSlotContent === mode.id ? "is-active" : ""}" data-slot-content-mode="${mode.id}" type="button" title="${escapeAttribute(mode.label)}">${escapeHtml(mode.shortLabel)}</button>
          `).join("")}
        </div>

        <label class="field search-field">
          ${icon("search")}
          <input id="searchInput" type="search" placeholder="Маршрутная карта, спецификация, заказ" value="${escapeAttribute(ui.search)}" />
        </label>

        <label class="field">
          <span>Статус</span>
          ${renderDenseInlineSelect("statusFilter", ui.statusFilter, statusOptions, { type: "toolbar" })}
        </label>

        <label class="field">
          <span>Подразделение</span>
          ${renderDenseInlineSelect("workCenterFilter", ui.workCenterFilter, workCenterOptions, { type: "toolbar" })}
        </label>

        <div class="segmented row-mode" role="group" aria-label="Режим строк">
          <button class="segment ${ui.rowMode === "route" ? "is-active" : ""}" data-row-mode="route" type="button">Маршрут</button>
          <button class="segment ${ui.rowMode === "all" ? "is-active" : ""}" data-row-mode="all" type="button">Все подразделения</button>
        </div>
      </div>

      <div class="toolbar-actions">
        <button class="toggle-switch-button ${allRoutesExpanded ? "is-on" : ""}" data-toggle-all-projects type="button" aria-pressed="${allRoutesExpanded ? "true" : "false"}" title="${allRoutesExpanded ? "Свернуть все маршрутные карты" : "Развернуть все маршрутные карты"}">
          <span class="toggle-switch-knob"></span>
          <span>${allRoutesExpanded ? "Свернуть" : "Развернуть"}</span>
        </button>
        <button class="icon-button" id="todayButton" type="button" title="Перейти к сегодняшнему дню">${icon("calendar")}</button>
        <button class="icon-button" id="refreshButton" type="button" title="Перестроить план">${icon("refresh")}</button>
        <button class="icon-button danger-soft" id="resetButton" type="button" title="Сбросить демо-данные">${icon("reset")}</button>
        <button class="primary-button" id="addProjectButton" type="button">${icon("plus")}<span>Новое задание</span></button>
      </div>

      <div class="status-strip">
        <span class="status-pill neutral">${stats.routes} маршрутных карт</span>
        <span class="status-pill neutral">${stats.slots} слотов</span>
        <span class="status-pill ${stats.critical ? "critical" : "ok"}">${stats.critical} крит.</span>
        <span class="status-pill ${stats.warning ? "warning" : "ok"}">${stats.warning} пред.</span>
        <span class="clock">${icon("clock")}<span data-clock>${formatDateTime(ui.now)}</span></span>
      </div>
    </header>
  `;
}

function renderPlanningDirectorCommand(warningsContext, stats, scaleInfo) {
  const warnings = warningsContext.warnings || [];
  const backlog = buildBacklogItems(240);
  const critical = warnings.filter((warning) => warning.severity === "critical");
  const riskyProjects = getProductionContexts()
    .map((project) => ({
      project,
      dueState: getProjectDeadlineState(project),
      warnings: warnings.filter((warning) => warning.projectId === project.id).length,
      backlog: backlog.filter((item) => item.project.id === project.id).length,
      progress: calculateProjectProgress(project, planningState),
    }))
    .sort((left, right) => (
      Number(left.dueState.slackMs ?? Number.MAX_SAFE_INTEGER) - Number(right.dueState.slackMs ?? Number.MAX_SAFE_INTEGER)
      || right.warnings - left.warnings
      || right.backlog - left.backlog
    ));
  const warehouseSlots = planningState.slots.filter((slot) => slot.workCenterId === "warehouse");
  const completedWarehouse = warehouseSlots.filter((slot) => slot.status === "completed").length;
  const activeSlots = planningState.slots.filter((slot) => ["in_progress", "problem", "overdue"].includes(slot.status)).length;
  const plannedHours = planningState.slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0);
  const flowSteps = [
    {
      id: "queue",
      index: "01",
      title: "Очередь маршрута",
      value: backlog.length,
      caption: backlog.length ? "операций ждут размещения" : "все обязательные шаги размещены",
      tone: backlog.length ? "warning" : "ok",
    },
    {
      id: "schedule",
      index: "02",
      title: "Размещение",
      value: `${stats.slots}`,
      caption: `${formatDuration(plannedHours * 60 * 60 * 1000)} в плане · масштаб ${scaleConfig[ui.scale].label.toLowerCase()}`,
      tone: activeSlots ? "active" : "neutral",
    },
    {
      id: "control",
      index: "03",
      title: "Контроль плана",
      value: warnings.length,
      caption: critical.length ? `${critical.length} критичных конфликтов` : "критичных конфликтов нет",
      tone: critical.length ? "critical" : warnings.length ? "warning" : "ok",
    },
    {
      id: "warehouse",
      index: "04",
      title: "Склад и выпуск",
      value: `${completedWarehouse}/${warehouseSlots.length || 0}`,
      caption: "финальные складские операции",
      tone: warehouseSlots.length && completedWarehouse === warehouseSlots.length ? "ok" : "active",
    },
  ];

  return `
    <section class="director-command" aria-label="Линейный контур директора производства">
      <div class="director-command-head">
        <div>
          <span class="eyebrow">Контур директора производства</span>
          <strong>Портфель → очередь → Гант → контроль → выпуск</strong>
        </div>
        <div class="director-command-actions">
          <button class="secondary-button" data-open-planning-module type="button">${icon("calendar")}<span>Открыть Заказ на пр-во</span></button>
          <button class="secondary-button ${critical.length ? "danger" : ""}" data-fix-all-warnings type="button" ${warnings.length ? "" : "disabled"}>${icon("refresh")}<span>Исправить конфликты</span></button>
          <button class="secondary-button" data-save-plan-snapshot type="button">${icon("save")}<span>Снимок</span></button>
        </div>
      </div>

      <div class="director-flow-grid">
        ${flowSteps.map((step) => renderDirectorFlowStep(step)).join("")}
      </div>

      <div class="director-project-strip" aria-label="Приоритетные спецификации">
        ${riskyProjects.slice(0, 5).map((item) => `
          <button class="director-project-chip ${item.dueState.tone}" data-focus-project="${item.project.id}" type="button">
            <strong>${escapeHtml(getProjectDisplayName(item.project))}</strong>
            <span>${escapeHtml(item.project.orderNumber)} · ${item.progress}% · ${escapeHtml(item.dueState.label)}</span>
            <em>${item.warnings ? `${item.warnings} сигн.` : item.backlog ? `${item.backlog} в очереди` : "маршрут закрыт"}</em>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDirectorFlowStep(step) {
  return `
    <article class="director-flow-step ${step.tone}">
      <b>${escapeHtml(step.index)}</b>
      <div>
        <strong>${escapeHtml(step.title)}</strong>
        <span>${escapeHtml(step.caption)}</span>
      </div>
      <em>${escapeHtml(step.value)}</em>
    </article>
  `;
}

function renderTimeline(scaleInfo) {
  return `
    <div class="timeline-row" style="height:${TIMELINE_HEIGHT}px;">
      <div class="timeline-corner">
        <span>Маршрутные карты и подразделения</span>
      </div>
      <div class="timeline-cells" style="width:${scaleInfo.width}px; left:${LEFT_WIDTH}px;">
        ${scaleInfo.ticks.map((tick, index) => `
          <div class="timeline-cell ${getTimelineCellClass(tick)}" style="left:${index * scaleInfo.cellWidth}px; width:${scaleInfo.cellWidth}px;">
            <strong>${escapeHtml(tick.label)}</strong>
            <small>${escapeHtml(tick.sublabel)}</small>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function getTimelineCellClass(tick) {
  return isWeekendDate(tick.start) ? "is-weekend" : "";
}

function renderRow(row, rowLayout, scaleInfo, slotWarningMap, slotPlacementMap) {
  const layout = rowLayout.map[row.id];
  const height = layout.height;
  const isAggregateRow = row.type === "route" || row.type === "project";
  const laneClass = isAggregateRow ? "project-lane route-lane" : row.type === "resource" ? "workcenter-lane resource-lane" : "workcenter-lane department-lane";
  const rowSlots = getRowSlots(row);
  const rowPlacements = slotPlacementMap[row.id] || {};
  const isDropTarget = ui.drag?.targetRowId === row.id;

  return `
    <div class="gantt-row ${row.type}-row ${isDropTarget ? "is-drop-target" : ""}" data-row-id="${row.id}" style="height:${height}px; top:${layout.top}px;">
      ${renderRowLabel(row, slotWarningMap)}
      <div class="lane ${laneClass}" data-lane-row-id="${row.id}" style="left:${LEFT_WIDTH}px; width:${scaleInfo.width}px; height:${height}px; --cell-width:${scaleInfo.cellWidth}px;">
        ${renderNonWorkingLayer(row, scaleInfo, height)}
        ${renderTodayMarker(scaleInfo, height)}
        ${rowSlots.map((slot) => renderSlot(slot, row, scaleInfo, slotWarningMap, rowPlacements[slot.id])).join("")}
      </div>
    </div>
  `;
}

function isWeekendDate(value) {
  const day = toDate(value).getDay();
  return day === 0 || day === 6;
}

function parseShiftMinutes(shift) {
  const match = String(shift || "").match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!match) return { start: 8 * 60, end: 20 * 60 };

  const startHour = Math.max(0, Math.min(23, Number(match[1])));
  const startMinute = Math.max(0, Math.min(59, Number(match[2])));
  const endHour = Math.max(0, Math.min(24, Number(match[3])));
  const endMinute = Math.max(0, Math.min(59, Number(match[4])));

  return {
    start: Math.min(24 * 60, startHour * 60 + startMinute),
    end: Math.min(24 * 60, endHour * 60 + endMinute),
  };
}

function getWorkCenterCalendar(workCenter) {
  const shiftText = String(workCenter?.shift || "").trim();
  const normalized = shiftText.toLowerCase();

  if (normalized.includes("24/7") || normalized.includes("7/0")) {
    return {
      isAlwaysOn: true,
      scheduleType: "24/7",
      workDays: new Set([0, 1, 2, 3, 4, 5, 6]),
      start: 0,
      end: 24 * 60,
      label: "24/7",
    };
  }

  let workDays = new Set([1, 2, 3, 4, 5]);
  let scheduleType = "5/2";
  if (normalized.includes("6/1")) workDays = new Set([1, 2, 3, 4, 5, 6]);
  if (normalized.includes("6/1")) scheduleType = "6/1";
  if (normalized.includes("5/2")) {
    workDays = new Set([1, 2, 3, 4, 5]);
    scheduleType = "5/2";
  }
  if (normalized.includes("2/2")) {
    workDays = new Set([0, 1, 2, 3, 4, 5, 6]);
    scheduleType = "2/2";
  }

  const shift = parseShiftMinutes(shiftText);
  return {
    isAlwaysOn: false,
    scheduleType,
    workDays,
    ...shift,
    label: shiftText || "5/2 08:00-20:00",
  };
}

function isCalendarWorkDay(calendar, dayStart) {
  if (!calendar) return true;
  if (calendar.isAlwaysOn) return true;
  const normalizedDayStart = startOfDay(dayStart);

  if (calendar.scheduleType === "2/2") {
    const anchor = startOfDay(fromDateInput(SHIFT_CYCLE_ANCHOR_DATE));
    const dayIndex = Math.floor((normalizedDayStart.getTime() - anchor.getTime()) / DAY_MS);
    const cycleIndex = ((dayIndex % 4) + 4) % 4;
    return cycleIndex < 2;
  }

  return calendar.workDays.has(normalizedDayStart.getDay());
}

function getCalendarWorkCenterId(workCenterId) {
  const id = String(workCenterId || "");
  if (isSmtLineWorkCenterId(id)) return "smt";
  return id;
}

function getCalendarWorkCenter(workCenterId, state = null) {
  const sourceState = state || getRuntimePlanningState();
  const requestedId = String(workCenterId || "");
  const calendarWorkCenterId = getCalendarWorkCenterId(requestedId);
  return sourceState?.workCenters?.find((center) => center.id === calendarWorkCenterId)
    || getRuntimePlanningState()?.workCenters?.find((center) => center.id === calendarWorkCenterId)
    || {
      id: calendarWorkCenterId || requestedId,
      name: calendarWorkCenterId || requestedId || "Подразделение",
      shift: calendarWorkCenterId === "smt" ? "5/2 08:00-20:00" : "24/7",
      isPlanningUnit: true,
    };
}

function getGanttRowCalendar(row) {
  if (!["workCenter", "resource"].includes(row?.type)) return null;
  const calendarWorkCenterId = row.workCenter?.calendarWorkCenterId
    || row.workCenter?.parentWorkCenterId
    || getCalendarWorkCenterId(row.workCenterId);
  return getWorkCenterCalendar(getCalendarWorkCenter(calendarWorkCenterId, planningState));
}

function getWorkingIntervalsForCalendar(calendar, value) {
  const dayStart = startOfDay(value);
  const nextDay = addMs(dayStart, DAY_MS);

  if (!calendar) return [{ start: dayStart, end: nextDay }];
  if (calendar.isAlwaysOn) return [{ start: dayStart, end: nextDay }];
  if (calendar.start === calendar.end) return [];

  const intervals = [];
  const previousDayStart = addMs(dayStart, -DAY_MS);

  if (calendar.start < calendar.end) {
    if (isCalendarWorkDay(calendar, dayStart)) {
      intervals.push({
        start: minuteToDate(dayStart, calendar.start),
        end: minuteToDate(dayStart, calendar.end),
      });
    }
  } else {
    if (isCalendarWorkDay(calendar, previousDayStart)) {
      intervals.push({
        start: dayStart,
        end: minuteToDate(dayStart, calendar.end),
      });
    }
    if (isCalendarWorkDay(calendar, dayStart)) {
      intervals.push({
        start: minuteToDate(dayStart, calendar.start),
        end: nextDay,
      });
    }
  }

  return intervals
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
}

function getWorkingIntervalsForDay(workCenterId, value, state = null) {
  return getWorkingIntervalsForCalendar(
    getWorkCenterCalendar(getCalendarWorkCenter(workCenterId, state)),
    value,
  );
}

function getWorkingIntervalsBetween(workCenterId, start, end, state = null) {
  const rangeStart = toDate(start);
  const rangeEnd = toDate(end);
  if (rangeEnd <= rangeStart) return [];

  const intervals = [];
  let cursor = startOfDay(rangeStart);
  let guard = 0;
  while (cursor < rangeEnd && guard < 370) {
    guard += 1;
    getWorkingIntervalsForDay(workCenterId, cursor, state).forEach((interval) => {
      const clippedStart = new Date(Math.max(interval.start.getTime(), rangeStart.getTime()));
      const clippedEnd = new Date(Math.min(interval.end.getTime(), rangeEnd.getTime()));
      if (clippedEnd > clippedStart) intervals.push({ start: clippedStart, end: clippedEnd });
    });
    cursor = addMs(cursor, 24 * 60 * 60 * 1000);
  }

  return intervals;
}

function snapToWorkingTime(workCenterId, value, state = null) {
  let probe = toDate(value);
  let dayCursor = startOfDay(probe);

  for (let guard = 0; guard < 370; guard += 1) {
    const intervals = getWorkingIntervalsForDay(workCenterId, dayCursor, state);
    for (const interval of intervals) {
      if (probe <= interval.start) return interval.start;
      if (probe >= interval.start && probe < interval.end) return probe;
    }
    dayCursor = addMs(dayCursor, 24 * 60 * 60 * 1000);
    probe = dayCursor;
  }

  return toDate(value);
}

function addWorkingDuration(workCenterId, start, durationMs, state = null) {
  let remainingMs = Math.max(0, Number(durationMs || 0));
  let cursor = snapToWorkingTime(workCenterId, start, state);
  if (remainingMs <= 0) return cursor;

  for (let guard = 0; guard < 10000; guard += 1) {
    const intervals = getWorkingIntervalsForDay(workCenterId, cursor, state);
    let advanced = false;

    for (const interval of intervals) {
      if (cursor < interval.start) cursor = interval.start;
      if (cursor >= interval.end) continue;

      const availableMs = interval.end.getTime() - cursor.getTime();
      if (remainingMs <= availableMs) return addMs(cursor, remainingMs);

      remainingMs -= availableMs;
      cursor = interval.end;
      advanced = true;
    }

    const nextDay = addMs(startOfDay(cursor), 24 * 60 * 60 * 1000);
    cursor = snapToWorkingTime(workCenterId, advanced && nextDay <= cursor ? addMs(cursor, 1) : nextDay, state);
  }

  return addMs(cursor, remainingMs);
}

function getWorkingDurationBetween(workCenterId, start, end, state = null) {
  return getWorkingIntervalsBetween(workCenterId, start, end, state)
    .reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
}

function minuteToDate(dayStart, minute) {
  return addMs(dayStart, minute * 60 * 1000);
}

function addNonWorkingSegment(segments, start, end, type, scaleInfo) {
  const segmentStart = toDate(start);
  const segmentEnd = toDate(end);
  const clippedStart = new Date(Math.max(segmentStart.getTime(), scaleInfo.start.getTime()));
  const clippedEnd = new Date(Math.min(segmentEnd.getTime(), scaleInfo.end.getTime()));
  if (clippedEnd <= clippedStart) return;

  const left = dateToX(clippedStart, scaleInfo);
  const right = dateToX(clippedEnd, scaleInfo);
  if (right <= 0 || left >= scaleInfo.width) return;

  segments.push({
    type,
    left: Math.max(0, left),
    width: Math.max(1, Math.min(scaleInfo.width, right) - Math.max(0, left)),
  });
}

function buildNonWorkingSegments(row, scaleInfo) {
  const segments = [];
  const calendar = getGanttRowCalendar(row);
  if (calendar?.isAlwaysOn) return segments;

  let cursor = startOfDay(scaleInfo.start);
  while (cursor < scaleInfo.end) {
    const nextDay = addMs(cursor, DAY_MS);
    if (row.type === "project" || row.type === "route") {
      if (isWeekendDate(cursor)) addNonWorkingSegment(segments, cursor, nextDay, "day-off", scaleInfo);
      cursor = nextDay;
      continue;
    }

    if (!row.workCenter?.id || calendar.start === calendar.end) {
      addNonWorkingSegment(segments, cursor, nextDay, "day-off", scaleInfo);
      cursor = nextDay;
      continue;
    }

    const workingIntervals = getWorkingIntervalsForCalendar(calendar, cursor)
      .map((interval) => ({
        start: new Date(Math.max(interval.start.getTime(), cursor.getTime())),
        end: new Date(Math.min(interval.end.getTime(), nextDay.getTime())),
      }))
      .filter((interval) => interval.end > interval.start)
      .sort((left, right) => left.start - right.start);

    if (!workingIntervals.length) {
      addNonWorkingSegment(segments, cursor, nextDay, "day-off", scaleInfo);
      cursor = nextDay;
      continue;
    }

    let offCursor = cursor;
    workingIntervals.forEach((interval) => {
      if (interval.start > offCursor) {
        addNonWorkingSegment(segments, offCursor, interval.start, "off-hours", scaleInfo);
      }
      if (interval.end > offCursor) offCursor = interval.end;
    });

    if (offCursor < nextDay) {
      addNonWorkingSegment(segments, offCursor, nextDay, "off-hours", scaleInfo);
    }

    cursor = nextDay;
  }

  return segments;
}

function renderNonWorkingLayer(row, scaleInfo, height) {
  const segments = buildNonWorkingSegments(row, scaleInfo);
  if (!segments.length) return "";

  const label = ["workCenter", "resource"].includes(row.type)
    ? `Нерабочее время подразделения: ${row.workCenter.shift || "5/2 08:00-20:00"}`
    : "Нерабочие дни";

  return `
    <div class="non-working-layer" style="height:${height}px;" aria-hidden="true">
      ${segments.map((segment) => `
        <span class="non-working-segment is-${segment.type}" style="left:${round(segment.left)}px; width:${round(segment.width)}px;" title="${escapeAttribute(label)}"></span>
      `).join("")}
    </div>
  `;
}

function renderRowLabel(row, slotWarningMap = {}) {
  if (row.type === "route") {
    const route = row.route;
    const project = row.project || getProject(route?.projectId);
    const specification = getRouteSpecification(route);
    const progress = project ? calculateProjectProgress(project, planningState) : 0;
    const isExpanded = isGanttRouteExpanded(route);
    const routeSlots = getRouteSlots(route?.id || "");
    const routeSlotIds = new Set(routeSlots.map((slot) => slot.id));
    const issueCount = getSlotWarnings(planningState).warnings.filter((warning) => (
      (warning.slotIds || []).some((slotId) => routeSlotIds.has(slotId))
    )).length;
    const dueState = project ? getProjectDeadlineState(project) : { tone: "neutral", label: "срок не задан" };
    const routeSteps = getRouteStepsForModule(route?.id || "");

    return `
      <div class="row-label project-label route-label">
        <button class="chevron" data-toggle-project="${escapeAttribute(route.id)}" type="button" title="${isExpanded ? "Свернуть" : "Раскрыть"} маршрутную карту">
          ${icon(isExpanded ? "chevronDown" : "chevronRight")}
        </button>
        <div class="project-main">
          <div class="project-name-line">
            <strong>${escapeHtml(route.name || "Маршрутная карта")}</strong>
            ${issueCount ? `<span class="mini-alert" title="Есть предупреждения">${issueCount}</span>` : ""}
            <span class="deadline-badge ${dueState.tone}" title="Запас до срока">${escapeHtml(dueState.label)}</span>
          </div>
          <div class="project-meta">${escapeHtml(specification?.name || getProjectDisplayName(project) || "спецификация не выбрана")} · ${Number(getPlanningRouteQuantity(route) || project?.totalQuantity || 0).toLocaleString("ru-RU")} шт. · ${routeSteps.length} оп.</div>
          ${renderRouteTaskMini(route, slotWarningMap)}
        </div>
        <div class="project-side">
          <span class="project-status status-${project?.status || "planned"}">${PROJECT_STATUS_LABELS[project?.status] || "В плане"}</span>
          <strong class="project-progress-value">${progress}%</strong>
          <div class="progress" title="Прогресс маршрутной карты"><span style="width:${progress}%"></span></div>
        </div>
      </div>
    `;
  }

  if (row.type === "project") {
    const project = row.project;
    const specification = getSpecificationByProjectId(project.id);
    const progress = calculateProjectProgress(project, planningState);
    const isExpanded = ui.expandedProjects.has(project.id);
    const issueCount = getSlotWarnings(planningState).warnings.filter((warning) => warning.projectId === project.id).length;
    const dueState = getProjectDeadlineState(project);

    return `
      <div class="row-label project-label">
        <button class="chevron" data-toggle-project="${project.id}" type="button" title="${isExpanded ? "Свернуть" : "Раскрыть"} спецификацию">
          ${icon(isExpanded ? "chevronDown" : "chevronRight")}
        </button>
        <div class="project-main">
          <div class="project-name-line">
            <strong>${escapeHtml(getProjectDisplayName(project))}</strong>
            ${issueCount ? `<span class="mini-alert" title="Есть предупреждения">${issueCount}</span>` : ""}
            <span class="deadline-badge ${dueState.tone}" title="Запас до срока">${escapeHtml(dueState.label)}</span>
          </div>
          <div class="project-meta">${escapeHtml(specification?.outputItem || project.orderNumber || "изделие не задано")} · ${project.totalQuantity} шт. · срок ${formatDate(project.dueDate)}</div>
          ${renderProjectRouteMini(project, slotWarningMap)}
        </div>
        <div class="project-side">
          <span class="project-status status-${project.status}">${PROJECT_STATUS_LABELS[project.status]}</span>
          <strong class="project-progress-value">${progress}%</strong>
          <div class="progress" title="Прогресс спецификации"><span style="width:${progress}%"></span></div>
        </div>
      </div>
    `;
  }

  if (row.type === "resource") {
    const resource = row.resource || {};
    const parent = resource.parentResourceId ? getProductionResource(resource.parentResourceId) : null;
    const passiveClass = resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource) ? "" : "is-passive-resource";
    return `
      <div class="row-label workcenter-label resource-label ${passiveClass}">
        <span class="workcenter-code">${escapeHtml(parent ? "Доч." : PRODUCTION_RESOURCE_TYPE_CODES[resource.type] || "Рес")}</span>
        <span class="workcenter-name">${escapeHtml(resource.name || "Производственный ресурс")}</span>
        ${parent ? `<span class="outside-route">${escapeHtml(parent.name)}</span>` : ""}
        ${resourceParticipatesInPlanning(resource) || resourceParticipatesInCalculation(resource) ? "" : `<span class="outside-route">инфо</span>`}
      </div>
    `;
  }

  return `
    <div class="row-label workcenter-label department-label">
      <span class="workcenter-code">${escapeHtml(row.workCenter.code)}</span>
      <span class="workcenter-name">${escapeHtml(row.workCenter.name)}</span>
      ${row.isOutsideRoute ? `<span class="outside-route">вне маршрута</span>` : ""}
    </div>
  `;
}

function renderRouteTaskMini(route, slotWarningMap = {}) {
  const steps = getRouteStepsForModule(route?.id || "");
  const slots = getRouteSlots(route?.id || "");
  if (!steps.length) return "";

  return `
    <div class="project-route-mini route-task-mini" aria-label="Маршрутная карта">
      ${steps.map((step) => {
        const stepSlots = slots.filter((slot) => slot.routeStepId === step.id);
        const hasIssue = stepSlots.some((slot) => (slotWarningMap[slot.id] || []).length);
        const isCompleted = stepSlots.length && stepSlots.every((slot) => slot.status === "completed");
        const isActive = stepSlots.some((slot) => slot.status === "in_progress");
        const isPlanned = stepSlots.length > 0;
        const className = [
          isCompleted ? "is-done" : "",
          isActive ? "is-active" : "",
          isPlanned ? "is-planned" : "is-empty",
          hasIssue ? "is-warning" : "",
          step.workCenterId === "warehouse" ? "is-warehouse" : "",
        ].filter(Boolean).join(" ");
        const workCenter = getWorkCenter(step.workCenterId);
        return `<span class="${className}" title="${escapeAttribute(`${step.stepOrder}. ${step.operationName} · ${workCenter?.name || ""}`)}">${step.stepOrder}</span>`;
      }).join("")}
    </div>
  `;
}

function renderProjectRouteMini(project, slotWarningMap = {}) {
  const steps = getProjectRouteSteps(project.id, planningState);
  const slots = planningState.slots.filter((slot) => slot.projectId === project.id);
  if (!steps.length) return "";

  return `
    <div class="project-route-mini" aria-label="Маршрут спецификации">
      ${steps.map((step) => {
        const stepSlots = slots.filter((slot) => slot.routeStepId === step.id);
        const hasIssue = stepSlots.some((slot) => (slotWarningMap[slot.id] || []).length);
        const isCompleted = stepSlots.length && stepSlots.every((slot) => slot.status === "completed");
        const isActive = stepSlots.some((slot) => slot.status === "in_progress");
        const isPlanned = stepSlots.length > 0;
        const className = [
          isCompleted ? "is-done" : "",
          isActive ? "is-active" : "",
          isPlanned ? "is-planned" : "is-empty",
          hasIssue ? "is-warning" : "",
          step.workCenterId === "warehouse" ? "is-warehouse" : "",
        ].filter(Boolean).join(" ");
        const workCenter = getWorkCenter(step.workCenterId);
        return `<span class="${className}" title="${escapeAttribute(`${step.stepOrder}. ${step.operationName} · ${workCenter?.name || ""}`)}">${step.stepOrder}</span>`;
      }).join("")}
    </div>
  `;
}

function renderTodayMarker(scaleInfo, height) {
  const x = dateToX(ui.now, scaleInfo);
  if (x < 0 || x > scaleInfo.width) return "";
  return `<div class="today-marker" style="left:${x}px; height:${height}px;" title="Текущее время"></div>`;
}

function renderSlot(slot, row, scaleInfo, slotWarningMap, placement) {
  const batch = getBatch(slot.batchId);
  const project = getProject(slot.projectId);
  const workCenter = getWorkCenter(slot.workCenterId);
  const warningList = slotWarningMap[slot.id] || [];
  const hasCritical = warningList.some((warning) => warning.severity === "critical");
  const isAggregate = row.type === "project" || row.type === "route";
  const isWeekSlot = ui.scale === "weeks";
  const visualRect = placement?.rect || getSlotVisualRect(slot, scaleInfo, isAggregate);
  const top = placement?.top ?? getSlotTop(isAggregate);
  const height = placement?.height ?? getSlotHeight(isAggregate);
  const selectedClass = ui.selectedSlotId === slot.id ? "is-selected" : "";
  const warningClass = warningList.length ? `has-warning ${hasCritical ? "critical" : "warning"}` : "";
  const dragClass = ui.drag?.slotId === slot.id ? "is-dragging" : "";
  const warehouseClass = slot.workCenterId === "warehouse" ? "warehouse-slot" : "";
  const lockedClass = slot.locked ? "is-locked" : "";
  const quantity = normalizeQuantity(slot.quantity);
  const compactClass = visualRect.width < (isWeekSlot ? 58 : 136) ? "is-compact" : "";
  const tinyClass = visualRect.width < (isWeekSlot ? 36 : 58) ? "is-tiny" : "";
  const routeMeta = getSlotRouteMeta(slot);
  const durationMs = Math.max(0, toDate(slot.plannedEnd) - toDate(slot.plannedStart));
  const operationLabel = String(slot.operationName || workCenter?.name || "Операция").trim();
  const workingSegments = getSlotWorkingVisualSegments(slot, scaleInfo, visualRect);
  const segmentedClass = workingSegments.length > 1 ? "is-segmented" : "";

  if (workingSegments.length > 1) {
    const primaryIndex = workingSegments.reduce((bestIndex, segment, index, segments) => (
      segment.width > segments[bestIndex].width ? index : bestIndex
    ), 0);
    return `
      <article
        class="operation-slot status-${slot.status} ${warehouseClass} ${lockedClass} ${isAggregate ? "aggregate-slot" : ""} ${isWeekSlot ? "week-slot" : ""} ${compactClass} ${tinyClass} ${selectedClass} ${warningClass} ${dragClass} ${segmentedClass}"
        data-slot-id="${slot.id}"
        style="left:${visualRect.x}px; top:${top}px; width:${visualRect.width}px; height:${height}px;"
        title="${escapeAttribute(`${routeMeta.routeName || project?.name || ""}: партия ${batch?.batchNumber || ""} · ${operationLabel} · ${quantity} шт. · рабочее время ${formatDuration(getWorkingDurationBetween(slot.workCenterId, slot.plannedStart, slot.plannedEnd, planningState))}`)}"
        tabindex="0"
      >
        ${workingSegments.map((segment, index) => `
          <div class="slot-working-segment ${index === primaryIndex ? "is-primary" : ""}" style="left:${segment.offset}px; width:${segment.width}px;">
            <div class="slot-accent"></div>
            ${index === primaryIndex ? `
              <div class="slot-content">
                ${renderGanttSlotLine({
                  slot,
                  batch,
                  routeMeta,
                  operationLabel,
                  quantity,
                  isWeekSlot,
                  isAggregate,
                  warningList,
                })}
                ${!isAggregate && !isWeekSlot ? `
                  <div class="slot-footer">
                    <span>${escapeHtml(routeMeta.centerCode)} · ${STATUS_LABELS[slot.status]}</span>
                    <span>${formatTime(segment.start)}-${formatTime(segment.end)}</span>
                  </div>
                ` : ""}
              </div>
            ` : `<span class="slot-continuation-mark" title="${escapeAttribute(`${formatTime(segment.start)}-${formatTime(segment.end)}`)}"></span>`}
            ${index === workingSegments.length - 1 && !isAggregate && !isWeekSlot ? `<button class="resize-handle" data-resize-slot="${slot.id}" type="button" title="Изменить длительность"></button>` : ""}
          </div>
        `).join("")}
      </article>
    `;
  }

  return `
    <article
      class="operation-slot status-${slot.status} ${warehouseClass} ${lockedClass} ${isAggregate ? "aggregate-slot" : ""} ${isWeekSlot ? "week-slot" : ""} ${compactClass} ${tinyClass} ${selectedClass} ${warningClass} ${dragClass}"
      data-slot-id="${slot.id}"
      style="left:${visualRect.x}px; top:${top}px; width:${visualRect.width}px; height:${height}px;"
      title="${escapeAttribute(`${routeMeta.routeName || project?.name || ""}: партия ${batch?.batchNumber || ""} · ${operationLabel} · ${quantity} шт. · ${formatDuration(durationMs)}`)}"
      tabindex="0"
    >
      <div class="slot-accent"></div>
      <div class="slot-content">
        ${renderGanttSlotLine({
          slot,
          batch,
          routeMeta,
          operationLabel,
          quantity,
          isWeekSlot,
          isAggregate,
          warningList,
        })}
        ${!isAggregate && !isWeekSlot ? `
          <div class="slot-footer">
            <span>${escapeHtml(routeMeta.centerCode)} · ${STATUS_LABELS[slot.status]}</span>
            <span>${formatTime(slot.plannedStart)}-${formatTime(slot.plannedEnd)}</span>
          </div>
        ` : ""}
      </div>
      ${!isAggregate && !isWeekSlot ? `<button class="resize-handle" data-resize-slot="${slot.id}" type="button" title="Изменить длительность"></button>` : ""}
    </article>
  `;
}

function renderGanttSlotLine({ slot, batch, routeMeta, operationLabel, quantity, isWeekSlot, isAggregate, warningList }) {
  const mode = getGanttSlotContentMode().id;
  const lineClass = isWeekSlot ? "week-slot-line" : "slot-line";
  const quantityInput = isWeekSlot
    ? `<input class="slot-quantity-input compact" data-slot-quantity="${slot.id}" type="number" min="1" step="1" value="${quantity}" title="Количество изделий" ${isAggregate || slot.locked ? "disabled" : ""} />`
    : `<label class="slot-quantity-control" title="Количество изделий в операции">
        <input data-slot-quantity="${slot.id}" type="number" min="1" step="1" value="${quantity}" ${isAggregate || slot.locked ? "disabled" : ""} />
        <span>шт.</span>
      </label>`;
  const warningDot = warningList.length ? `<span class="slot-warning-dot">${icon("alert")}</span>` : "";
  const stepChip = `<b class="slot-step-chip">${escapeHtml(routeMeta.orderLabel)}</b>`;
  const operationName = `<strong class="slot-operation-name">${escapeHtml(operationLabel)}</strong>`;
  const batchLabel = `<strong class="slot-operation-name">Партия ${escapeHtml(batch?.batchNumber || "-")}</strong>`;
  const quantityLabel = `<strong class="slot-operation-name slot-quantity-label">${Number(quantity || 0).toLocaleString("ru-RU")} шт.</strong>`;

  const contentByMode = {
    operationQuantity: `${stepChip}${operationName}${quantityInput}${warningDot}`,
    operation: `${stepChip}${operationName}${warningDot}`,
    quantity: `${stepChip}${quantityInput}${warningDot}`,
    batchStep: `${stepChip}${batchLabel}${warningDot}`,
  };

  return `<div class="${lineClass} slot-content-${escapeAttribute(mode)}">${contentByMode[mode] || contentByMode.operationQuantity}</div>`;
}

function getSlotRouteMeta(slot) {
  const route = getSlotRoute(slot);
  const steps = route ? getRouteStepsForModule(route.id) : getProjectRouteSteps(slot.projectId, planningState);
  const step = steps.find((item) => item.id === slot.routeStepId);
  const workCenter = getWorkCenter(slot.workCenterId);
  return {
    route,
    routeName: route?.name || "",
    step,
    total: steps.length,
    orderLabel: step ? `${step.stepOrder}/${steps.length || "?"}` : "?",
    centerCode: workCenter?.code || slot.workCenterId || "-",
  };
}

function getSlotVisualRect(slot, scaleInfo, isAggregate = false) {
  const x = dateToX(slot.plannedStart, scaleInfo);
  const timeWidth = dateToX(slot.plannedEnd, scaleInfo) - x;
  const zoom = Number(scaleInfo.zoom || 1);
  if (ui.scale === "weeks") {
    const width = Math.max((isAggregate ? 18 : 20) * zoom, timeWidth);
    return { x, width, right: x + width };
  }

  const minWidthByScale = { hours: 30, days: 28, weeks: 24 };
  const width = Math.max((isAggregate ? 18 : minWidthByScale[ui.scale]) * zoom, timeWidth);

  return {
    x,
    width,
    right: x + width,
  };
}

function getSlotWorkingVisualSegments(slot, scaleInfo, visualRect) {
  const intervals = getWorkingIntervalsBetween(slot.workCenterId, slot.plannedStart, slot.plannedEnd, planningState);
  if (intervals.length <= 1) return intervals.map((interval) => {
    const left = Math.max(visualRect.x, dateToX(interval.start, scaleInfo));
    const right = Math.min(visualRect.right, dateToX(interval.end, scaleInfo));
    return {
      start: interval.start,
      end: interval.end,
      x: left,
      offset: Math.max(0, left - visualRect.x),
      width: Math.max(1, right - left),
      right,
    };
  });

  return intervals
    .map((interval) => {
      const left = Math.max(visualRect.x, dateToX(interval.start, scaleInfo));
      const right = Math.min(visualRect.right, dateToX(interval.end, scaleInfo));
      return {
        start: interval.start,
        end: interval.end,
        x: left,
        offset: Math.max(0, left - visualRect.x),
        width: Math.max(1, right - left),
        right,
      };
    })
    .filter((segment) => segment.right > segment.x);
}

function renderDependencies(rows, rowLayout, scaleInfo, slotWarningMap, slotPlacementMap) {
  const visibleRowIds = new Set(rows.map((row) => row.id));
  const slotById = byId(planningState.slots);
  const slotMaskRects = buildDependencySlotMaskRects(rows, rowLayout, scaleInfo, slotPlacementMap);
  const maskId = "dependencySlotReadabilityMask";
  const maskAttribute = slotMaskRects.length ? ` mask="url(#${maskId})"` : "";
  const paths = [];

  for (const pair of getDependencyPairs(planningState)) {
    const from = slotById[pair.fromSlotId];
    const to = slotById[pair.toSlotId];
    if (!from || !to) continue;

    const fromRowId = getVisibleSlotRowId(from);
    const toRowId = getVisibleSlotRowId(to);
    if (!fromRowId || !toRowId || !visibleRowIds.has(fromRowId) || !visibleRowIds.has(toRowId)) continue;
    if (fromRowId.startsWith("project:") || toRowId.startsWith("project:") || fromRowId.startsWith("route:") || toRowId.startsWith("route:")) continue;

    const fromLayout = rowLayout.map[fromRowId];
    const toLayout = rowLayout.map[toRowId];
    if (!fromLayout || !toLayout) continue;

    const fromPlacement = slotPlacementMap[fromRowId]?.[from.id];
    const toPlacement = slotPlacementMap[toRowId]?.[to.id];
    const fromRect = fromPlacement?.rect || getSlotVisualRect(from, scaleInfo);
    const toRect = toPlacement?.rect || getSlotVisualRect(to, scaleInfo);
    const x1 = fromRect.right;
    const y1 = getSlotConnectionY(fromLayout, fromPlacement, false);
    const x2 = toRect.x;
    const y2 = getSlotConnectionY(toLayout, toPlacement, false);
    const hasIssue = (slotWarningMap[from.id] || []).length || (slotWarningMap[to.id] || []).length;
    const className = hasIssue ? "dependency-path has-issue" : "dependency-path";
    const underlayClassName = hasIssue ? "dependency-path-underlay has-issue" : "dependency-path-underlay";
    const markerId = hasIssue ? "dependencyArrowIssue" : "dependencyArrow";
    const mutedMarkerId = hasIssue ? "dependencyArrowIssueMuted" : "dependencyArrowMuted";
    const d = buildDependencyPathAroundSlots(x1, y1, x2, y2, fromRect, toRect);

    paths.push(`
      <path class="${underlayClassName} dependency-path-muted" d="${d}" />
      <path class="${className} dependency-path-muted" d="${d}" marker-end="url(#${mutedMarkerId})" />
      <path class="${underlayClassName}" d="${d}"${maskAttribute} />
      <path class="${className}" d="${d}" marker-end="url(#${markerId})"${maskAttribute} />
    `);
  }

  return `
    <svg class="dependencies-layer ${ui.scale === "weeks" ? "week-dependencies" : ""}" style="left:${LEFT_WIDTH}px; top:${TIMELINE_HEIGHT}px; width:${scaleInfo.width}px; height:${rowLayout.totalHeight}px; --dependency-clip-left:${ui.scrollLeft}px;" aria-hidden="true">
      <defs>
        <marker id="dependencyArrow" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow" />
        </marker>
        <marker id="dependencyArrowIssue" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow has-issue" />
        </marker>
        <marker id="dependencyArrowMuted" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow is-muted" />
        </marker>
        <marker id="dependencyArrowIssueMuted" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M 1 1.5 L 9.5 5.5 L 1 9.5 Z" class="dependency-arrow has-issue is-muted" />
        </marker>
        ${slotMaskRects.length ? `
          <mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${round(scaleInfo.width)}" height="${round(rowLayout.totalHeight)}">
            <rect x="0" y="0" width="${round(scaleInfo.width)}" height="${round(rowLayout.totalHeight)}" fill="white" />
            ${slotMaskRects.map((rect) => `
              <rect x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.width)}" height="${round(rect.height)}" rx="${round(rect.radius)}" fill="black" />
            `).join("")}
          </mask>
        ` : ""}
      </defs>
      ${paths.join("")}
    </svg>
  `;
}

function buildDependencySlotMaskRects(rows, rowLayout, scaleInfo, slotPlacementMap) {
  const padding = ui.scale === "weeks" ? 1 : 2;
  return rows.flatMap((row) => {
    const layout = rowLayout.map[row.id];
    if (!layout) return [];
    const isAggregate = row.type === "project" || row.type === "route";
    return getRowSlots(row).map((slot) => {
      const placement = slotPlacementMap[row.id]?.[slot.id];
      const rect = placement?.rect || getSlotVisualRect(slot, scaleInfo, isAggregate);
      const top = placement?.top ?? getSlotTop(isAggregate);
      const height = placement?.height ?? getSlotHeight(isAggregate);
      return {
        x: Math.max(0, rect.x - padding),
        y: Math.max(0, layout.top + top - padding),
        width: rect.width + padding * 2,
        height: height + padding * 2,
        radius: isAggregate || ui.scale === "weeks" ? height / 2 : 8,
      };
    });
  });
}

function renderGanttSnapOverlay(rowLayout, scaleInfo, slotPlacementMap) {
  if (!ui.drag?.moved) return "";

  const slot = planningState.slots.find((item) => item.id === ui.drag.slotId);
  if (!slot) return "";

  const rowId = ui.drag.targetRowId || getVisibleSlotRowId(slot);
  const layout = rowLayout.map[rowId];
  if (!layout) return "";

  const isProjectRow = rowId.startsWith("project:") || rowId.startsWith("route:");
  const placement = slotPlacementMap[rowId]?.[slot.id];
  const rect = placement?.rect || getSlotVisualRect(slot, scaleInfo, isProjectRow);
  const snapWidth = getGanttSnapWidth(scaleInfo);
  const guideX = ui.drag.mode === "resize" ? rect.right : rect.x;
  const columnWidth = Math.max(3, snapWidth);
  const columnLeft = Math.max(0, Math.min(scaleInfo.width - columnWidth, Math.floor(guideX / Math.max(snapWidth, 1)) * snapWidth));
  const top = layout.top + (placement?.top ?? getSlotTop(isProjectRow));
  const height = placement?.height ?? getSlotHeight(isProjectRow);
  const gridClass = snapWidth >= 6 ? "is-readable" : "is-dense";

  return `
    <div
      class="gantt-snap-overlay ${gridClass}"
      style="left:${LEFT_WIDTH}px; top:${TIMELINE_HEIGHT}px; width:${scaleInfo.width}px; height:${rowLayout.totalHeight}px; --cell-width:${scaleInfo.cellWidth}px; --snap-width:${round(snapWidth)}px; --dependency-clip-left:${ui.scrollLeft}px;"
      aria-hidden="true"
    >
      <div class="gantt-snap-grid"></div>
      <div class="gantt-snap-column" style="left:${round(columnLeft)}px; width:${round(columnWidth)}px;"></div>
      <div class="gantt-drag-ghost" style="left:${round(rect.x)}px; top:${round(top)}px; width:${round(rect.width)}px; height:${round(height)}px;"></div>
      <div class="gantt-snap-guide ${ui.drag.mode === "resize" ? "is-resize" : "is-move"}" style="left:${round(guideX)}px;"></div>
    </div>
  `;
}

function buildDependencyPathAroundSlots(x1, y1, x2, y2, fromRect, toRect) {
  const cornerRadius = ui.scale === "weeks" ? 5 : 8;
  const targetLeft = toRect.x;
  const targetApproachX = targetLeft - (ui.scale === "weeks" ? 10 : 18);
  const startStubX = fromRect.right + (ui.scale === "weeks" ? 8 : 16);

  if (Math.abs(y1 - y2) < 1) {
    return roundedOrthogonalPath([
      [x1, y1],
      [targetApproachX, y1],
      [x2, y2],
    ], cornerRadius);
  }

  if (targetApproachX > x1 + 18) {
    return roundedOrthogonalPath([
      [x1, y1],
      [targetApproachX, y1],
      [targetApproachX, y2],
      [x2, y2],
    ], cornerRadius);
  }

  const outerX = Math.max(startStubX, x1 + (ui.scale === "weeks" ? 18 : 30));
  const leftBypassX = Math.min(targetApproachX, x2 - (ui.scale === "weeks" ? 10 : 18));
  const midY = y1 + (y2 - y1) / 2;

  return roundedOrthogonalPath([
    [x1, y1],
    [outerX, y1],
    [outerX, midY],
    [leftBypassX, midY],
    [leftBypassX, y2],
    [x2, y2],
  ], cornerRadius);
}

function buildDependencyPath(x1, y1, x2, y2) {
  if (Math.abs(y1 - y2) < 1) {
    return roundedOrthogonalPath([[x1, y1], [x2, y2]], 8);
  }

  if (x2 > x1 + 64) {
    const turnX = x1 + (x2 - x1) / 2;
    return roundedOrthogonalPath([
      [x1, y1],
      [turnX, y1],
      [turnX, y2],
      [x2, y2],
    ], 8);
  }

  const startStubX = x1 + 34;
  const approachX = Math.max(x2 - 22, x1 + 34);
  const midY = y1 + (y2 - y1) / 2;

  return roundedOrthogonalPath([
    [x1, y1],
    [startStubX, y1],
    [startStubX, midY],
    [approachX, midY],
    [approachX, y2],
    [x2, y2],
  ], 8);
}

function roundedOrthogonalPath(points, radius) {
  const compactPoints = points.filter((point, index) => (
    index === 0
    || point[0] !== points[index - 1][0]
    || point[1] !== points[index - 1][1]
  ));

  if (compactPoints.length < 2) return "";

  const commands = [`M ${round(compactPoints[0][0])} ${round(compactPoints[0][1])}`];

  for (let index = 1; index < compactPoints.length - 1; index += 1) {
    const previous = compactPoints[index - 1];
    const current = compactPoints[index];
    const next = compactPoints[index + 1];
    const incoming = normalize([current[0] - previous[0], current[1] - previous[1]]);
    const outgoing = normalize([next[0] - current[0], next[1] - current[1]]);
    const incomingLength = distance(previous, current);
    const outgoingLength = distance(current, next);
    const cornerRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);

    if (!cornerRadius || isSameDirection(incoming, outgoing)) {
      commands.push(`L ${round(current[0])} ${round(current[1])}`);
      continue;
    }

    const before = [
      current[0] - incoming[0] * cornerRadius,
      current[1] - incoming[1] * cornerRadius,
    ];
    const after = [
      current[0] + outgoing[0] * cornerRadius,
      current[1] + outgoing[1] * cornerRadius,
    ];

    commands.push(`L ${round(before[0])} ${round(before[1])}`);
    commands.push(`Q ${round(current[0])} ${round(current[1])} ${round(after[0])} ${round(after[1])}`);
  }

  const last = compactPoints[compactPoints.length - 1];
  commands.push(`L ${round(last[0])} ${round(last[1])}`);
  return commands.join(" ");
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1]);
  return length ? [vector[0] / length, vector[1] / length] : [0, 0];
}

function distance(left, right) {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function isSameDirection(left, right) {
  return Math.abs(left[0] - right[0]) < 0.001 && Math.abs(left[1] - right[1]) < 0.001;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function renderIssueDock(warnings) {
  const critical = warnings.filter((warning) => warning.severity === "critical");
  const regular = warnings.filter((warning) => warning.severity !== "critical");
  const sorted = [...critical, ...regular].slice(0, 7);

  return `
    <aside class="issue-dock">
      <div class="issue-header">
        <strong>Предупреждения плана</strong>
        <span>${warnings.length}</span>
      </div>
      <div class="issue-list">
        ${sorted.length ? sorted.map((warning) => `
          <button class="issue-item ${warning.severity}" data-focus-warning="${warning.slotIds?.[0] || ""}" type="button">
            ${icon(warning.severity === "critical" ? "alert" : "info")}
            <span>${escapeHtml(warning.message)}</span>
          </button>
        `).join("") : `
          <div class="empty-state">${icon("check")}<span>Конфликтов и нарушений маршрута нет</span></div>
        `}
      </div>
    </aside>
  `;
}

function renderPlanningAssistantDock(warnings) {
  const backlog = buildBacklogItems(8);
  const critical = warnings.filter((warning) => warning.severity === "critical");
  const regular = warnings.filter((warning) => warning.severity !== "critical");
  const sortedWarnings = [...critical, ...regular].slice(0, 5);
  const workload = buildWorkloadRows();
  const topWorkload = workload[0];
  const riskyProjects = getProductionContexts()
    .map((project) => ({ project, dueState: getProjectDeadlineState(project) }))
    .filter((item) => ["critical", "warning"].includes(item.dueState.tone));

  return `
    <aside class="planning-assistant-dock" aria-label="Помощник планирования">
      <div class="assistant-dock-head">
        <span class="eyebrow">Линейная работа с планом</span>
        <strong>Сначала очередь, затем исправления, затем контроль</strong>
      </div>
      <section class="assistant-panel backlog-panel">
        <div class="assistant-panel-head">
          <div>
            <strong>Очередь из Планирования</strong>
            <span>${backlog.length ? "операции доступны только через модуль Заказ на пр-во" : "очередь пуста"}</span>
          </div>
          <em>${backlog.length}</em>
        </div>
        <div class="assistant-list backlog-list">
          ${backlog.length ? backlog.map((item) => `
            <article class="assistant-item backlog-item">
              <button class="assistant-item-main" data-open-planning-for-project="${escapeAttribute(item.project.id)}" type="button">
                <strong>${escapeHtml(item.routeStep.operationName)}</strong>
                <span>${escapeHtml(getProjectDisplayName(item.project) || item.project.name)} · партия ${escapeHtml(item.batch.batchNumber)} · ${item.quantity} шт.</span>
              </button>
              <div class="assistant-item-meta">
                <span>${escapeHtml(item.workCenter?.code || "")}</span>
                <span>${formatDateTime(item.plannedStart)}</span>
                <button class="mini-action" data-open-planning-for-project="${escapeAttribute(item.project.id)}" type="button">Открыть Заказ на пр-во</button>
              </div>
            </article>
          `).join("") : `
            <div class="assistant-empty">${icon("check")}<span>Нет обязательных шагов без слота</span></div>
          `}
        </div>
        <div class="assistant-panel-actions">
          <button class="secondary-button" data-open-planning-module type="button">${icon("calendar")}<span>Открыть Заказ на пр-во</span></button>
        </div>
      </section>

      <section class="assistant-panel conflict-panel">
        <div class="assistant-panel-head">
          <div>
            <strong>Исправления</strong>
            <span>маршрут, перегрузка подразделения, количество</span>
          </div>
          <em class="${critical.length ? "critical" : warnings.length ? "warning" : "ok"}">${warnings.length}</em>
        </div>
        <div class="assistant-list conflict-list">
          ${sortedWarnings.length ? sortedWarnings.map((warning) => `
            <article class="assistant-item conflict-item ${warning.severity}">
              <button class="assistant-item-main" data-focus-warning="${warning.slotIds?.[0] || ""}" type="button">
                <strong>${escapeHtml(formatWarningType(warning.type))}</strong>
                <span>${escapeHtml(warning.message)}</span>
              </button>
              <div class="assistant-item-meta">
                <span>${warning.severity === "critical" ? "Критично" : "Предупр."}</span>
                <button class="mini-action" data-fix-warning="${escapeAttribute(warning.id)}" type="button">Исправить</button>
              </div>
            </article>
          `).join("") : `
            <div class="assistant-empty">${icon("check")}<span>План без активных предупреждений</span></div>
          `}
        </div>
        <div class="assistant-panel-actions">
          <button class="secondary-button ${critical.length ? "danger" : ""}" data-fix-all-warnings type="button" ${warnings.length ? "" : "disabled"}>${icon("refresh")}<span>Исправить все доступное</span></button>
        </div>
      </section>

      <section class="assistant-panel intelligence-panel">
        <div class="assistant-panel-head">
          <div>
            <strong>Контроль плана</strong>
            <span>автосдвиг, риски, буфер маршрута</span>
          </div>
          <em>${ui.autoCascade ? "ON" : "OFF"}</em>
        </div>
        <div class="planning-controls">
          <label class="assistant-toggle">
            <input type="checkbox" data-auto-cascade ${ui.autoCascade ? "checked" : ""} />
            <span>Автосдвиг цепочки партии</span>
          </label>
          <button class="assistant-command" data-save-plan-snapshot type="button">${icon("save")}<span>Снимок плана</span></button>
        </div>
        <div class="assistant-metrics">
          <div><strong>${topWorkload?.label || "-"}</strong><span>самое загруженное подразделение</span></div>
          <div><strong>${riskyProjects.length}</strong><span>спецификаций у срока</span></div>
          <div><strong>${formatDuration(getRouteBufferMs())}</strong><span>буфер маршрута</span></div>
        </div>
      </section>
    </aside>
  `;
}

function formatWarningType(type) {
  const labels = {
    capacity: "Загрузка",
    route: "Маршрут",
    quantity: "Количество",
    duration: "Длительность",
  };
  return labels[type] || "План";
}

function renderSlotDrawer(slotWarningMap) {
  const slot = ui.selectedSlotId ? planningState.slots.find((item) => item.id === ui.selectedSlotId) : null;
  if (!slot) return "";

  const project = getProject(slot.projectId);
  const batch = getBatch(slot.batchId);
  const workCenter = getWorkCenter(slot.workCenterId);
  const allRouteSteps = getProjectRouteSteps(slot.projectId, planningState);
  const currentStep = allRouteSteps.find((step) => step.id === slot.routeStepId);
  const currentTaskId = getRouteStepTaskId(currentStep);
  const routeSteps = allRouteSteps.filter((step) => getRouteStepTaskId(step) === currentTaskId);
  const orderedSlots = planningState.slots
    .filter((item) => (
      item.projectId === slot.projectId
      && item.batchId === slot.batchId
      && getSlotRouteTaskId(item) === currentTaskId
    ))
    .sort((a, b) => {
      const left = routeSteps.find((step) => step.id === a.routeStepId)?.stepOrder ?? 999;
      const right = routeSteps.find((step) => step.id === b.routeStepId)?.stepOrder ?? 999;
      return left - right;
    });
  const currentIndex = orderedSlots.findIndex((item) => item.id === slot.id);
  const previous = orderedSlots[currentIndex - 1];
  const next = orderedSlots[currentIndex + 1];
  const planMs = toDate(slot.plannedEnd) - toDate(slot.plannedStart);
  const factMs = slot.actualStart && slot.actualEnd ? toDate(slot.actualEnd) - toDate(slot.actualStart) : null;
  const deviation = factMs === null ? "нет факта" : formatDuration(factMs - planMs);
  const warnings = slotWarningMap[slot.id] || [];

  return `
    <aside class="slot-drawer detail-drawer" aria-label="Карточка операции">
      <div class="drawer-header">
        <div>
          <span class="eyebrow">MOD · Right Detail Drawer</span>
          <h2>${escapeHtml(slot.operationName)}</h2>
        </div>
        <button class="icon-button" data-close-drawer type="button" title="Закрыть">${icon("close")}</button>
      </div>

      <div class="drawer-summary status-${slot.status}">
        <div>
          <strong>Партия ${escapeHtml(batch?.batchNumber || "")}</strong>
          <span>${Number(slot.quantity || 0).toLocaleString("ru-RU")} шт.</span>
        </div>
        <span>${STATUS_LABELS[slot.status]}</span>
      </div>

      <div class="drawer-signal-grid">
        <article>
          <span>Плановая длительность</span>
          <strong>${formatDuration(planMs)}</strong>
        </article>
        <article>
          <span>Подразделение</span>
          <strong>${escapeHtml(workCenter?.code || "-")}</strong>
        </article>
        <article>
          <span>Шаг маршрута</span>
          <strong>${currentStep?.stepOrder || "-"}/${routeSteps.length || "-"}</strong>
        </article>
        <article class="${warnings.length ? "warning" : "ok"}">
          <span>Сигналы</span>
          <strong>${warnings.length}</strong>
        </article>
      </div>

      <dl class="detail-grid">
        <div><dt>Спецификация</dt><dd>${escapeHtml(getProjectDisplayName(project) || "")}</dd></div>
        <div><dt>Заказ</dt><dd>${escapeHtml(project?.orderNumber || "")}</dd></div>
        <div><dt>Подразделение</dt><dd>${escapeHtml(workCenter?.name || "")}</dd></div>
        <div><dt>Шаг маршрута</dt><dd>${currentStep?.stepOrder || "-"} · ${escapeHtml(currentStep?.operationName || "")}</dd></div>
        <div><dt>План</dt><dd>${formatDateTime(slot.plannedStart)} - ${formatDateTime(slot.plannedEnd)}</dd></div>
        <div><dt>Факт</dt><dd>${slot.actualStart ? formatDateTime(slot.actualStart) : "-"} - ${slot.actualEnd ? formatDateTime(slot.actualEnd) : "-"}</dd></div>
        <div><dt>Отклонение</dt><dd>${escapeHtml(deviation)}</dd></div>
        <div><dt>Фиксация</dt><dd>${slot.locked ? "Зафиксировано" : "Можно двигать"}</dd></div>
        <div><dt>Комментарий</dt><dd>${escapeHtml(slot.comment || "Без комментария")}</dd></div>
      </dl>

      ${renderDrawerRouteSequence(routeSteps, orderedSlots, slot)}

      <div class="route-neighbors">
        <button class="ghost-button" data-focus-slot="${previous?.id || ""}" type="button" ${previous ? "" : "disabled"}>${icon("arrowLeft")}<span>${previous ? previous.operationName : "Предыдущей нет"}</span></button>
        <button class="ghost-button" data-focus-slot="${next?.id || ""}" type="button" ${next ? "" : "disabled"}><span>${next ? next.operationName : "Следующей нет"}</span>${icon("arrowRight")}</button>
      </div>

      ${warnings.length ? `
        <div class="drawer-warnings">
          ${warnings.map((warning) => `<div class="${warning.severity}">${icon(warning.severity === "critical" ? "alert" : "info")}<span>${escapeHtml(warning.message)}</span></div>`).join("")}
        </div>
      ` : ""}

      <div class="drawer-actions">
        <button class="primary-button" data-edit-slot="${slot.id}" type="button">${icon("edit")}<span>Изменить</span></button>
        <button class="secondary-button" data-cycle-status="${slot.id}" type="button">${icon("play")}<span>Статус</span></button>
        <button class="secondary-button" data-find-window-slot="${slot.id}" type="button">${icon("search")}<span>Окно</span></button>
        <button class="secondary-button" data-cascade-slot="${slot.id}" type="button">${icon("refresh")}<span>Цепочка</span></button>
        <button class="secondary-button" data-toggle-lock-slot="${slot.id}" type="button">${icon(slot.locked ? "unlock" : "lock")}<span>${slot.locked ? "Снять фиксацию" : "Зафиксировать"}</span></button>
        <button class="secondary-button" data-split-slot="${slot.id}" type="button">${icon("split")}<span>Разделить</span></button>
        <button class="secondary-button danger" data-delete-slot="${slot.id}" type="button">${icon("trash")}<span>Удалить</span></button>
      </div>
    </aside>
  `;
}

function renderDrawerRouteSequence(routeSteps, orderedSlots, currentSlot) {
  if (!routeSteps.length) return "";
  return `
    <div class="drawer-route-sequence" aria-label="Последовательность партии">
      <strong>Последовательность партии</strong>
      <div>
        ${routeSteps.map((step) => {
          const stepSlot = orderedSlots.find((item) => item.routeStepId === step.id);
          const className = [
            stepSlot ? "is-planned" : "is-empty",
            stepSlot?.id === currentSlot.id ? "is-current" : "",
            stepSlot?.status === "completed" ? "is-done" : "",
            stepSlot?.status === "in_progress" ? "is-active" : "",
            step.workCenterId === "warehouse" ? "is-warehouse" : "",
          ].filter(Boolean).join(" ");
          return `
            <button class="${className}" data-focus-slot="${stepSlot?.id || ""}" type="button" ${stepSlot ? "" : "disabled"} title="${escapeAttribute(step.operationName)}">
              <b>${step.stepOrder}</b>
              <span>${escapeHtml(getWorkCenter(step.workCenterId)?.code || step.workCenterId)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderEditorModal() {
  if (!ui.editor) return "";

  const isEdit = ui.editor.mode === "edit";
  const slot = isEdit ? planningState.slots.find((item) => item.id === ui.editor.slotId) : ui.editor.defaults;
  if (!slot) return "";

  const project = getProject(slot.projectId);
  const projectBatches = planningState.batches.filter((batch) => batch.projectId === slot.projectId);
  const routeSteps = getProjectRouteSteps(slot.projectId, planningState);
  const routeStep = routeSteps.find((step) => step.id === slot.routeStepId) || routeSteps.find((step) => step.workCenterId === slot.workCenterId) || routeSteps[0];
  const batch = getBatch(slot.batchId) || projectBatches[0];

  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <section class="modal large-modal form-modal slot-form-modal" role="dialog" aria-modal="true" aria-label="${isEdit ? "Редактирование слота" : "Создание слота"}">
        <form id="slotForm">
          <div class="modal-header">
            <div>
              <span class="eyebrow">MOD · Form Modal · ${isEdit ? "Редактирование" : "Новый слот"}</span>
              <h2>${escapeHtml(getProjectDisplayName(project) || "Спецификация")}</h2>
            </div>
            <button class="icon-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
          </div>

          <input type="hidden" name="slotId" value="${isEdit ? slot.id : ""}" />
          <input type="hidden" name="projectId" value="${slot.projectId}" />

          <div class="form-grid">
            <label class="form-field readonly">
              <span>Спецификация</span>
              <input type="text" value="${escapeAttribute(getProjectDisplayName(project) || "")}" readonly />
            </label>

            <label class="form-field command-field">
              <span>Партия</span>
              <select name="batchId" required>
                ${projectBatches.map((item) => `<option value="${item.id}" ${selected(batch?.id, item.id)}>Партия ${escapeHtml(item.batchNumber)} · ${item.quantity} шт.</option>`).join("")}
              </select>
            </label>

            <label class="form-field command-field">
              <span>Операция маршрута</span>
              <select name="routeStepId" id="routeStepField" required>
                ${routeSteps.map((step) => `<option value="${step.id}" data-work-center="${step.workCenterId}" data-operation="${escapeAttribute(step.operationName)}" ${selected(routeStep?.id, step.id)}>${step.stepOrder}. ${escapeHtml(step.operationName)}</option>`).join("")}
              </select>
            </label>

            <label class="form-field command-field">
              <span>Подразделение</span>
              <select name="workCenterId" id="workCenterField" required>
                ${getPlanningWorkCenters().map((center) => `<option value="${center.id}" ${selected(slot.workCenterId || routeStep?.workCenterId, center.id)}>${escapeHtml(center.name)}</option>`).join("")}
              </select>
            </label>

            <label class="form-field">
              <span>Название операции</span>
              <input name="operationName" id="operationField" type="text" value="${escapeAttribute(slot.operationName || routeStep?.operationName || "")}" required />
            </label>

            <label class="form-field readonly">
              <span>Количество, шт.</span>
              <input type="text" value="${Number(slot.quantity || batch?.quantity || 1).toLocaleString("ru-RU")} шт. · редактируется прямо в колбаске" readonly />
            </label>

            <label class="form-field">
              <span>Плановое начало</span>
              <input name="plannedStart" type="datetime-local" value="${isoLocal(slot.plannedStart)}" required />
            </label>

            <label class="form-field">
              <span>Плановое окончание</span>
              <input name="plannedEnd" type="datetime-local" value="${isoLocal(slot.plannedEnd)}" readonly />
            </label>

            <label class="form-field">
              <span>Фактическое начало</span>
              <input name="actualStart" type="datetime-local" value="${slot.actualStart ? isoLocal(slot.actualStart) : ""}" />
            </label>

            <label class="form-field">
              <span>Фактическое окончание</span>
              <input name="actualEnd" type="datetime-local" value="${slot.actualEnd ? isoLocal(slot.actualEnd) : ""}" />
            </label>

            <label class="form-field command-field">
              <span>Статус</span>
              <select name="status" required>
                ${SLOT_STATUSES.map((status) => `<option value="${status}" ${selected(slot.status || "planned", status)}>${STATUS_LABELS[status]}</option>`).join("")}
              </select>
            </label>

            <label class="form-field full">
              <span>Комментарий</span>
              <textarea name="comment" rows="3">${escapeHtml(slot.comment || "")}</textarea>
            </label>
          </div>

          <div class="modal-footer">
            <button class="secondary-button" data-close-modal type="button">Отмена</button>
            <button class="primary-button" type="submit">${icon("save")}<span>${isEdit ? "Сохранить слот" : "Создать слот"}</span></button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderSplitModal() {
  const slot = ui.splitSlotId ? planningState.slots.find((item) => item.id === ui.splitSlotId) : null;
  if (!slot) return "";

  const batch = getBatch(slot.batchId);
  const max = Math.max(1, Number(slot.quantity || 0) - 1);

  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <section class="modal confirm-modal split-confirm-modal" role="dialog" aria-modal="true" aria-label="Разделение партии">
        <form id="splitForm">
          <div class="modal-header">
            <div>
              <span class="eyebrow">MOD · Confirm Compact · Разделение</span>
              <h2>Партия ${escapeHtml(batch?.batchNumber || "")}</h2>
            </div>
            <button class="icon-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
          </div>

          <div class="confirm-body warning">
            <div class="confirm-icon">${icon("split")}</div>
            <div>
              <p>Новый слот сохранит спецификацию, маршрутный шаг и подразделение. Исходный слот будет уменьшен на указанное количество.</p>
              <span>Действие влияет на план партии и последующую цепочку операций.</span>
            </div>
          </div>

          <div class="compact-form-row">
            <label class="form-field">
              <span>Количество в новом слоте</span>
              <input name="splitQuantity" type="number" min="1" max="${max}" value="${Math.ceil(max / 2)}" required />
            </label>
          </div>

          <div class="modal-footer">
            <button class="secondary-button" data-close-modal type="button">Отмена</button>
            <button class="primary-button" type="submit">${icon("split")}<span>Разделить</span></button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderProjectModal() {
  if (!ui.projectModal) return "";
  const date = toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000));

  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <section class="modal large-modal wizard-modal" role="dialog" aria-modal="true" aria-label="Добавление спецификации">
        <form id="projectForm">
          <div class="modal-header">
            <div>
              <span class="eyebrow">MOD · Wizard Modal</span>
              <h2>Производственный заказ</h2>
            </div>
            <button class="icon-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
          </div>

          <div class="debug-steps modal-steps">
            <span class="is-active">1 Спецификация</span>
            <span class="is-active">2 Заказ</span>
            <span class="is-active">3 Маршрут</span>
            <span>4 План</span>
          </div>

          <div class="form-grid">
            <label class="form-field">
              <span>Название спецификации</span>
              <input name="name" type="text" value="Новый контроллер" required />
            </label>
            <label class="form-field">
              <span>Номер заказа</span>
              <input name="orderNumber" type="text" value="№${Math.floor(1600 + Math.random() * 200)}" required />
            </label>
            <label class="form-field">
              <span>Заказчик</span>
              <input name="customer" type="text" value="Новый заказчик" />
            </label>
            <label class="form-field">
              <span>Количество</span>
              <input name="totalQuantity" type="number" min="1" value="500" required />
            </label>
            <label class="form-field">
              <span>Срок сдачи</span>
              <input name="dueDate" type="date" value="${date}" required />
            </label>
            <label class="form-field command-field">
              <span>Статус</span>
              <select name="status">
                ${PROJECT_STATUSES.map((status) => `<option value="${status}" ${selected(status, "planned")}>${PROJECT_STATUS_LABELS[status]}</option>`).join("")}
              </select>
            </label>
            <label class="form-field full command-field">
              <span>Шаблон маршрута</span>
              <select name="routeTemplate">
                ${routeTemplateOptions.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join("")}
              </select>
            </label>
          </div>

          <div class="modal-footer">
            <button class="secondary-button" data-close-modal type="button">Отмена</button>
            <button class="primary-button" type="submit">${icon("plus")}<span>Добавить спецификацию</span></button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function bindEvents(scaleInfo, rows, rowLayout) {
  const shell = app.querySelector("[data-gantt-shell]");
  shell?.addEventListener("scroll", () => {
    ui.scrollLeft = shell.scrollLeft;
    ui.scrollTop = shell.scrollTop;
    updateDependencyClip(shell);
    extendTimelineIfNeeded(shell, scaleInfo);
  }, { passive: true });

  app.querySelector("#periodStart")?.addEventListener("change", (event) => {
    ui.windowStart = event.target.value;
    render();
  });

  app.querySelectorAll("[data-scale]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.scale = button.dataset.scale;
      ui.ganttZoom = ui.scale === "hours" ? Math.max(normalizeGanttZoom(ui.ganttZoom), 1.5) : normalizeGanttZoom(ui.ganttZoom);
      render();
    });
  });

  app.querySelectorAll("[data-gantt-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      setGanttZoom(button.dataset.ganttZoom);
    });
  });

  app.querySelectorAll("[data-slot-content-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.ganttSlotContent = normalizeGanttSlotContent(button.dataset.slotContentMode);
      persistUiState();
      render();
    });
  });

  app.querySelector("#searchInput")?.addEventListener("input", (event) => {
    ui.search = event.target.value;
    render();
  });

  app.querySelector("#statusFilter")?.addEventListener("change", (event) => {
    ui.statusFilter = event.target.value;
    render();
  });

  app.querySelector("#workCenterFilter")?.addEventListener("change", (event) => {
    ui.workCenterFilter = event.target.value;
    render();
  });

  app.querySelectorAll("[data-dense-toolbar-select] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-toolbar-select]");
      if (!root) return;
      const key = root.dataset.denseToolbarSelect;
      if (key === "statusFilter") ui.statusFilter = button.dataset.denseValue || "all";
      if (key === "workCenterFilter") ui.workCenterFilter = button.dataset.denseValue || "all";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-row-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.rowMode = button.dataset.rowMode;
      render();
    });
  });

  app.querySelector("#todayButton")?.addEventListener("click", () => {
    ui.windowStart = toDateInput(startOfDay(ui.now));
    render();
  });

  app.querySelector("#refreshButton")?.addEventListener("click", () => render());

  app.querySelector("#resetButton")?.addEventListener("click", () => {
    openConfirmDialog("resetDemo");
  });

  app.querySelector("#addProjectButton")?.addEventListener("click", () => {
    ui.activeModule = "planning";
    persistUiState();
    render();
  });

  app.querySelector("[data-toggle-all-projects]")?.addEventListener("click", () => {
    const routes = getVisibleGanttRoutes();
    const shouldExpand = !areAllVisibleProjectsExpanded();
    routes.forEach((route) => {
      if (shouldExpand) {
        ui.expandedProjects.add(route.id);
      } else {
        ui.expandedProjects.delete(route.id);
        ui.expandedProjects.delete(route.projectId);
      }
    });
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-toggle-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.toggleProject;
      const route = (planningState.routes || []).find((item) => item.id === id);
      if (route) {
        if (isGanttRouteExpanded(route)) {
          ui.expandedProjects.delete(route.id);
          ui.expandedProjects.delete(route.projectId);
        } else {
          ui.expandedProjects.add(route.id);
        }
      } else if (ui.expandedProjects.has(id)) {
        ui.expandedProjects.delete(id);
      } else {
        ui.expandedProjects.add(id);
      }
      render();
    });
  });

  app.querySelectorAll("[data-lane-row-id]").forEach((lane) => {
    lane.addEventListener("click", (event) => {
      if (event.target.closest(".operation-slot")) return;
      const row = rows.find((item) => item.id === lane.dataset.laneRowId);
      if (!row || row.type !== "workCenter") return;
      openPlanningForRoute(row.routeId);
    });
  });

  app.querySelectorAll("[data-slot-quantity]").forEach((input) => {
    ["click", "dblclick", "pointerdown"].forEach((eventName) => {
      input.addEventListener(eventName, (event) => event.stopPropagation());
    });

    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Enter") return;
      event.preventDefault();
      updateSlotQuantity(input.dataset.slotQuantity, input.value);
    });

    input.addEventListener("change", () => {
      updateSlotQuantity(input.dataset.slotQuantity, input.value);
    });
  });

  app.querySelectorAll(".operation-slot").forEach((slotElement) => {
    const slotId = slotElement.dataset.slotId;

    slotElement.addEventListener("click", (event) => {
      event.stopPropagation();
      if (ui.drag?.moved) return;
      ui.selectedSlotId = slotId;
      render();
    });

    slotElement.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      ui.selectedSlotId = slotId;
      ui.editor = { mode: "edit", slotId };
      render();
    });

    slotElement.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".resize-handle")) return;
      beginDrag(event, slotId, "move", rows, rowLayout, scaleInfo);
    });
  });

  app.querySelectorAll("[data-resize-slot]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      beginDrag(event, handle.dataset.resizeSlot, "resize", rows, rowLayout, scaleInfo);
    });
  });

  app.querySelectorAll("[data-focus-warning]").forEach((button) => {
    button.addEventListener("click", () => focusSlot(button.dataset.focusWarning));
  });

  app.querySelectorAll("[data-focus-slot]").forEach((button) => {
    button.addEventListener("click", () => focusSlot(button.dataset.focusSlot));
  });

  app.querySelector("[data-close-drawer]")?.addEventListener("click", () => {
    ui.selectedSlotId = null;
    render();
  });

  app.querySelectorAll("[data-edit-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.editor = { mode: "edit", slotId: button.dataset.editSlot };
      render();
    });
  });

  app.querySelectorAll("[data-cycle-status]").forEach((button) => {
    button.addEventListener("click", () => {
      cycleSlotStatus(button.dataset.cycleStatus);
    });
  });

  app.querySelectorAll("[data-split-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.splitSlotId = button.dataset.splitSlot;
      render();
    });
  });

  app.querySelectorAll("[data-delete-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("deleteSlot", { slotId: button.dataset.deleteSlot });
    });
  });

  app.querySelectorAll("[data-find-window-slot]").forEach((button) => {
    button.addEventListener("click", () => moveSlotToNearestWindow(button.dataset.findWindowSlot));
  });

  app.querySelectorAll("[data-cascade-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      openConfirmDialog("cascadeSlot", { slotId: button.dataset.cascadeSlot });
    });
  });

  app.querySelectorAll("[data-toggle-lock-slot]").forEach((button) => {
    button.addEventListener("click", () => toggleSlotLock(button.dataset.toggleLockSlot));
  });

  app.querySelectorAll("[data-open-planning-for-project]").forEach((button) => {
    button.addEventListener("click", () => {
      openPlanningForProject(button.dataset.openPlanningForProject || "");
    });
  });

  app.querySelectorAll("[data-open-planning-module]").forEach((button) => {
    button.addEventListener("click", () => {
      openPlanningForProject(ui.activeProjectId || "");
    });
  });

  app.querySelectorAll("[data-fix-warning]").forEach((button) => {
    button.addEventListener("click", () => autoFixWarning(button.dataset.fixWarning));
  });

  app.querySelectorAll("[data-fix-all-warnings]").forEach((button) => {
    button.addEventListener("click", () => openConfirmDialog("fixAllWarnings"));
  });

  app.querySelectorAll("[data-focus-project]").forEach((button) => {
    button.addEventListener("click", () => focusProject(button.dataset.focusProject));
  });

  app.querySelector("[data-auto-cascade]")?.addEventListener("change", (event) => {
    ui.autoCascade = event.target.checked;
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-save-plan-snapshot]").forEach((button) => {
    button.addEventListener("click", () => savePlanSnapshot());
  });

  app.querySelectorAll("[data-close-modal], [data-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-close-modal]")) return;
      closeModals();
    });
  });

  bindSlotForm();
  bindSplitForm();
  bindProjectForm();
}

function bindSlotForm() {
  const form = app.querySelector("#slotForm");
  if (!form) return;

  const routeStepField = form.querySelector("#routeStepField");
  const workCenterField = form.querySelector("#workCenterField");
  const operationField = form.querySelector("#operationField");
  const quantityField = form.querySelector("[name='quantity']");
  const batchField = form.querySelector("[name='batchId']");
  const plannedStartField = form.querySelector("[name='plannedStart']");
  const plannedEndField = form.querySelector("[name='plannedEnd']");
  const editedSlot = ui.editor?.mode === "edit"
    ? planningState.slots.find((slot) => slot.id === ui.editor.slotId)
    : null;

  const syncPlannedEndField = () => {
    if (!plannedStartField?.value || !plannedEndField || !workCenterField?.value) return;
    const batch = getBatch(batchField?.value);
    const quantity = normalizeQuantity(quantityField?.value, editedSlot?.quantity || batch?.quantity || 1);
    const selectedStep = planningState.routeSteps.find((step) => step.id === routeStepField?.value);
	    const plannedEnd = calculatePlannedEndByQuantity(
	      cleanDateTime(plannedStartField.value),
	      workCenterField.value,
	      quantity,
	      planningState,
	      selectedStep?.unitsPerHour || editedSlot?.unitsPerHour || null,
	      selectedStep?.boardsPerPanel || editedSlot?.boardsPerPanel || null,
	      selectedStep || editedSlot,
	    );
    plannedEndField.value = isoLocal(plannedEnd);
  };

  routeStepField?.addEventListener("change", () => {
    const option = routeStepField.selectedOptions[0];
    if (option?.dataset.workCenter && workCenterField) workCenterField.value = option.dataset.workCenter;
    if (option?.dataset.operation && operationField) operationField.value = option.dataset.operation;
    syncPlannedEndField();
  });

  [workCenterField, quantityField, batchField, plannedStartField].forEach((field) => {
    field?.addEventListener("change", syncPlannedEndField);
    field?.addEventListener("input", syncPlannedEndField);
  });
  syncPlannedEndField();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const stamp = new Date().toISOString();
    const slotId = data.get("slotId");
    const currentSlot = slotId ? planningState.slots.find((slot) => slot.id === slotId) : null;
    const selectedBatch = getBatch(data.get("batchId"));
    const quantity = normalizeQuantity(
      data.has("quantity") ? data.get("quantity") : currentSlot?.quantity,
      currentSlot?.quantity || selectedBatch?.quantity || 1,
    );
	    const plannedStart = toSlotDateTime(snapToWorkingTime(data.get("workCenterId"), cleanDateTime(data.get("plannedStart")), planningState));
    const selectedRouteStep = planningState.routeSteps.find((step) => step.id === data.get("routeStepId"));
    const unitsPerHour = Number(selectedRouteStep?.unitsPerHour || currentSlot?.unitsPerHour || 0);
    const boardsPerPanel = normalizeBoardsPerPanel(selectedRouteStep?.boardsPerPanel || currentSlot?.boardsPerPanel, 1);
	    const slotContext = selectedRouteStep || currentSlot;
	    const plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(plannedStart, data.get("workCenterId"), quantity, planningState, unitsPerHour || null, boardsPerPanel, slotContext));
    const slotData = {
      projectId: data.get("projectId"),
      batchId: data.get("batchId"),
      workCenterId: data.get("workCenterId"),
      routeStepId: data.get("routeStepId"),
      operationName: String(data.get("operationName") || "").trim(),
	      quantity,
	      unitsPerHour: unitsPerHour || undefined,
	      boardsPerPanel,
	      resourceId: selectedRouteStep?.resourceId || currentSlot?.resourceId || "",
	      calculationType: selectedRouteStep?.calculationType || currentSlot?.calculationType || "",
	      secondsPerPanel: selectedRouteStep?.secondsPerPanel || currentSlot?.secondsPerPanel || 0,
	      setupMin: selectedRouteStep?.setupMin || currentSlot?.setupMin || 0,
	      bomListId: selectedRouteStep?.bomListId || currentSlot?.bomListId || "",
      plannedStart,
      plannedEnd,
      actualStart: cleanOptionalDateTime(data.get("actualStart")),
      actualEnd: cleanOptionalDateTime(data.get("actualEnd")),
      status: data.get("status"),
      comment: String(data.get("comment") || "").trim(),
      updatedAt: stamp,
    };

    if (toDate(slotData.plannedEnd) <= toDate(slotData.plannedStart)) {
      alert("Плановое окончание должно быть позже начала.");
      return;
    }

    if (slotId) {
      planningState.slots = planningState.slots.map((slot) => (
        slot.id === slotId ? { ...slot, ...slotData } : slot
      ));
      ui.selectedSlotId = slotId;
      cascadeIfEnabled(slotId);
    } else {
      const newSlot = {
        id: makeId("s"),
        ...slotData,
        createdAt: stamp,
      };
      planningState.slots = [...planningState.slots, newSlot];
      ui.selectedSlotId = newSlot.id;
      cascadeIfEnabled(newSlot.id);
    }

    ui.editor = null;
    persistState();
    notifySaveSuccess(slotId ? "Слот сохранен" : "Слот создан");
    render();
  });
}

function bindSplitForm() {
  const form = app.querySelector("#splitForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const sourceSlot = planningState.slots.find((slot) => slot.id === ui.splitSlotId);
    if (!sourceSlot) return;

    const data = new FormData(form);
    const quantity = Number(data.get("splitQuantity"));
    if (!quantity || quantity <= 0 || quantity >= sourceSlot.quantity) {
      alert("Количество должно быть больше 0 и меньше количества исходного слота.");
      return;
    }

    const sourceBatch = getBatch(sourceSlot.batchId);
    const stamp = new Date().toISOString();
    const childIndex = planningState.batches.filter((batch) => batch.parentBatchId === (sourceBatch.parentBatchId || sourceBatch.id)).length + 1;
    const sourceQuantity = normalizeQuantity(sourceSlot.quantity - quantity);
	    const sourcePlannedEnd = calculatePlannedEndByQuantity(sourceSlot.plannedStart, sourceSlot.workCenterId, sourceQuantity, planningState, sourceSlot.unitsPerHour || null, sourceSlot.boardsPerPanel || null, sourceSlot);
	    const childPlannedEnd = calculatePlannedEndByQuantity(sourcePlannedEnd, sourceSlot.workCenterId, quantity, planningState, sourceSlot.unitsPerHour || null, sourceSlot.boardsPerPanel || null, sourceSlot);
    const childBatch = {
      id: makeId("b"),
      routeId: sourceSlot.routeId || sourceBatch?.routeId || "",
      specificationId: sourceSlot.specificationId || sourceBatch?.specificationId || sourceSlot.projectId,
      projectId: sourceSlot.specificationId || sourceBatch?.specificationId || sourceSlot.projectId,
      batchNumber: `${sourceBatch.batchNumber}.${childIndex}`,
      quantity,
      parentBatchId: sourceBatch.parentBatchId || sourceBatch.id,
      status: "planned",
      createdAt: stamp,
      updatedAt: stamp,
    };
    const childSlot = {
      ...sourceSlot,
      id: makeId("s"),
      batchId: childBatch.id,
      quantity,
      plannedStart: toSlotDateTime(sourcePlannedEnd),
      plannedEnd: toSlotDateTime(childPlannedEnd),
      actualStart: "",
      actualEnd: "",
      status: "planned",
      comment: `Выделено из партии ${sourceBatch.batchNumber}.`,
      createdAt: stamp,
      updatedAt: stamp,
    };

    planningState.batches = [...planningState.batches, childBatch];
    planningState.slots = planningState.slots
      .map((slot) => slot.id === sourceSlot.id ? {
        ...slot,
        quantity: sourceQuantity,
        plannedEnd: toSlotDateTime(sourcePlannedEnd),
        updatedAt: stamp,
      } : slot)
      .concat(childSlot);

    cascadeIfEnabled(sourceSlot.id);
    cascadeIfEnabled(childSlot.id);
    ui.splitSlotId = null;
    ui.selectedSlotId = childSlot.id;
    persistState();
    notifySaveSuccess("Партия разделена");
    render();
  });
}

function bindProjectForm() {
  const form = app.querySelector("#projectForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const stamp = new Date().toISOString();
    const specification = syncSpecificationDerivedFields({
      id: makeId("spec"),
      name: String(data.get("name") || "").trim() || "Новая спецификация",
      outputItem: String(data.get("name") || "").trim() || "Новая спецификация",
      orderNumber: String(data.get("orderNumber") || "").trim(),
      customer: String(data.get("customer") || "").trim(),
      productionQuantity: normalizeOptionalPositiveInteger(data.get("totalQuantity")) || 1,
      dueDate: data.get("dueDate"),
      productionStatus: PROJECT_STATUSES.includes(data.get("status")) ? String(data.get("status")) : "planned",
      status: "Активен",
      structureManaged: true,
      structureItems: [],
      createdAt: stamp,
      updatedAt: stamp,
    });
    const bundle = createProductionBundle({
      specificationId: specification.id,
      name: specification.name,
      orderNumber: specification.orderNumber,
      customer: specification.customer,
      totalQuantity: specification.productionQuantity,
      dueDate: specification.dueDate,
      status: specification.productionStatus,
      routeTemplate: data.get("routeTemplate"),
    });

    directoryState.specifications = [...(directoryState.specifications || []), specification];
    planningState.batches = [...planningState.batches, bundle.batch];
    planningState.routes = [...planningState.routes, bundle.route];
    planningState.routeSteps = [...planningState.routeSteps, ...bundle.routeSteps];
    planningState.projects = [];
    ui.expandedProjects.add(bundle.route.id);
    ui.projectModal = false;
    if (ui.activeModule === "calculator") {
      calculatorState = normalizeCalculatorState({
        ...calculatorState,
        projectId: specification.id,
        specificationId: specification.id,
        bomListId: "",
        boardQuantity: normalizeOptionalPositiveInteger(specification.productionQuantity),
        routeOperations: [],
        selectedOperationId: "",
        componentCounts: {},
        componentCountsByOperation: {},
        inputsSavedAt: "",
        lastSavedAt: "",
      });
      ui.calculatorStep = "inputs";
      persistCalculatorState();
    }
    persistDirectoryState();
    persistState();
    persistUiState();
    notifySaveSuccess("Спецификация добавлена");
    render();
  });
}

function beginDrag(event, slotId, mode, rows, rowLayout, scaleInfo) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  if (slot.locked || slot.status === "completed") {
    ui.selectedSlotId = slotId;
    render();
    return;
  }

  const shell = app.querySelector("[data-gantt-shell]");
  const shellRect = shell.getBoundingClientRect();
  const route = getSlotRoute(slot);

  ui.drag = {
    mode,
    slotId,
    snapMs: getGanttSnapMs(),
    startClientX: event.clientX,
    startClientY: event.clientY,
    originalStart: toDate(slot.plannedStart),
    originalEnd: toDate(slot.plannedEnd),
    originalWorkCenterId: slot.workCenterId,
    projectId: slot.projectId,
    routeId: route?.id || "",
    targetRowId: getVisibleSlotRowId(slot),
    moved: false,
    shellTop: shellRect.top,
    scrollTop: shell.scrollTop,
  };

  ui.selectedSlotId = slotId;
  document.body.classList.add("is-manipulating");

  const onMove = (moveEvent) => {
    if (!ui.drag) return;
    moveEvent.preventDefault();
    ui.drag.moved = true;

    const dx = moveEvent.clientX - ui.drag.startClientX;
    const snapMs = ui.drag.snapMs || getGanttSnapMs();
    const msDelta = Math.round(dx / scaleInfo.cellWidth * scaleInfo.unitMs / snapMs) * snapMs;
    const targetSlot = planningState.slots.find((item) => item.id === slotId);
    if (!targetSlot) return;

    if (mode === "resize") {
      const minEnd = addMs(ui.drag.originalStart, snapMs);
      const rawEnd = new Date(ui.drag.originalEnd.getTime() + msDelta);
	      const newEnd = new Date(Math.max(minEnd.getTime(), snapDate(rawEnd, snapMs).getTime()));
	      const nextQuantity = calculateQuantityByDuration(targetSlot.workCenterId, targetSlot.plannedStart, newEnd, targetSlot);
	      targetSlot.quantity = nextQuantity;
	      targetSlot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(targetSlot.plannedStart, targetSlot.workCenterId, nextQuantity, planningState, targetSlot.unitsPerHour || null, targetSlot.boardsPerPanel || null, targetSlot));
	      targetSlot.updatedAt = new Date().toISOString();
	    } else {
	      const rawStart = snapDate(addMs(ui.drag.originalStart, msDelta), snapMs);

	      const targetRow = rowFromPointer(moveEvent, rows, rowLayout);
	      if (["workCenter", "resource"].includes(targetRow?.type) && targetRow.routeId === ui.drag.routeId) {
	        applyGanttRowToSlot(targetSlot, targetRow);
	        ui.drag.targetRowId = targetRow.id;
	      }

	      const newStart = snapToWorkingTime(targetSlot.workCenterId, rawStart, planningState);
	      targetSlot.plannedStart = toSlotDateTime(newStart);
	      targetSlot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(newStart, targetSlot.workCenterId, targetSlot.quantity, planningState, targetSlot.unitsPerHour || null, targetSlot.boardsPerPanel || null, targetSlot));
	      targetSlot.updatedAt = new Date().toISOString();
	    }

    render();
  };

  const onUp = () => {
    document.body.classList.remove("is-manipulating");
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    const moved = ui.drag?.moved;
    if (moved) cascadeIfEnabled(slotId);
    persistState();
    ui.drag = null;
    if (moved) notifySaveSuccess("Операция Ганта сохранена");
    render();
    setTimeout(() => {
      if (moved) ui.drag = null;
    }, 0);
  };

  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", onUp);
}

function rowFromPointer(event, rows, rowLayout) {
  const shell = app.querySelector("[data-gantt-shell]");
  if (!shell) return null;
  const rect = shell.getBoundingClientRect();
  const y = event.clientY - rect.top + shell.scrollTop - TIMELINE_HEIGHT;

  return rows.find((row) => {
    const layout = rowLayout.map[row.id];
    return y >= layout.top && y <= layout.top + layout.height;
  });
}

function placeSlotInNearestWindow(slot, earliestOverride = null) {
  if (!slot || slot.locked || slot.status === "completed") return;

  const previous = getRouteNeighbor(slot, -1);
  const routeEarliest = previous ? addMs(previous.plannedEnd, getRouteBufferMs()) : toDate(slot.plannedStart);
  const earliestStart = new Date(Math.max(
    toDate(earliestOverride || slot.plannedStart).getTime(),
    toDate(routeEarliest).getTime(),
  ));
	  const durationMs = calculateRequiredDurationMs(slot.workCenterId, slot.quantity, planningState, slot.unitsPerHour, slot.boardsPerPanel || null, slot);
  const window = findFreeWindow(slot.workCenterId, durationMs, earliestStart, slot.id, slot.resourceId || "");

	  slot.plannedStart = toSlotDateTime(window.start);
  slot.plannedEnd = toSlotDateTime(window.end);
  slot.updatedAt = new Date().toISOString();
  cascadeIfEnabled(slot.id);
  return true;
}

function moveSlotToNearestWindow(slotId, earliestOverride = null) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!placeSlotInNearestWindow(slot, earliestOverride)) return;
  persistState();
  notifySaveSuccess("Операция перемещена в свободное окно");
  render();
}

function toggleSlotLock(slotId) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  slot.locked = !slot.locked;
  slot.updatedAt = new Date().toISOString();
  persistState();
  notifySaveSuccess(slot.locked ? "Операция заблокирована" : "Операция разблокирована");
  render();
}

function autoFixAllWarnings() {
  let fixed = 0;
  let guard = 0;

  while (guard < 120) {
    guard += 1;
    const warning = getSlotWarnings(planningState).warnings
      .sort((left, right) => (left.severity === "critical" ? -1 : 1) - (right.severity === "critical" ? -1 : 1))[0];
    if (!warning) break;
    if (!applyWarningFixInPlace(warning)) break;
    fixed += 1;
  }

  if (fixed) {
    persistState();
    notifySaveSuccess(`Исправления плана сохранены: ${fixed}`);
    render();
    return;
  }

  const firstWarning = getSlotWarnings(planningState).warnings[0];
  focusSlot(firstWarning?.slotIds?.[0] || "");
}

function applyWarningFixInPlace(warning) {
  if (!warning) return false;
  const slots = (warning.slotIds || [])
    .map((slotId) => planningState.slots.find((slot) => slot.id === slotId))
    .filter(Boolean);
  const stamp = new Date().toISOString();

  if (warning.type === "capacity" && slots.length >= 2) {
    const ordered = [...slots].sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart));
    const target = ordered[ordered.length - 1];
    const blocker = ordered[ordered.length - 2];
    if (!target || !blocker) return false;
    return Boolean(placeSlotInNearestWindow(target, addMs(blocker.plannedEnd, getRouteBufferMs())));
  }

  if (warning.type === "route" && warning.id.startsWith("sequence-") && slots.length >= 2) {
    const previous = slots[0];
    const current = slots[1];
    return Boolean(placeSlotInNearestWindow(current, addMs(previous.plannedEnd, getRouteBufferMs())));
  }

  if (warning.type === "route" && warning.id.startsWith("wrong-workcenter-") && slots[0]) {
    const slot = slots[0];
    if (slot.locked || slot.status === "completed") return false;
    const step = planningState.routeSteps.find((item) => item.id === slot.routeStepId);
    if (!step) return false;
    slot.workCenterId = step.workCenterId;
	    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity, planningState, slot.unitsPerHour || null, slot.boardsPerPanel || null, slot));
    slot.updatedAt = stamp;
    return Boolean(placeSlotInNearestWindow(slot, slot.plannedStart));
  }

  if (warning.type === "quantity" && slots[0]) {
    const slot = slots[0];
    if (slot.locked || slot.status === "completed") return false;
    const previous = getRouteNeighbor(slot, -1);
    if (!previous) return false;
    slot.quantity = Math.min(normalizeQuantity(slot.quantity), normalizeQuantity(previous.quantity));
	    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity, planningState, slot.unitsPerHour || null, slot.boardsPerPanel || null, slot));
    slot.updatedAt = stamp;
    cascadeIfEnabled(slot.id);
    return true;
  }

  if (warning.type === "duration" && slots[0]) {
    const slot = slots[0];
    if (slot.locked || slot.status === "completed") return false;
	    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity, planningState, slot.unitsPerHour || null, slot.boardsPerPanel || null, slot));
    slot.updatedAt = stamp;
    cascadeIfEnabled(slot.id);
    return true;
  }

  if (warning.type === "route") {
    return false;
  }

  return false;
}

function autoFixWarning(warningId) {
  const warning = getSlotWarnings(planningState).warnings.find((item) => item.id === warningId);
  if (!warning) return;

  const slots = (warning.slotIds || [])
    .map((slotId) => planningState.slots.find((slot) => slot.id === slotId))
    .filter(Boolean);
  const stamp = new Date().toISOString();

  if (warning.type === "capacity" && slots.length >= 2) {
    const ordered = [...slots].sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart));
    const target = ordered[ordered.length - 1];
    const blocker = ordered[ordered.length - 2];
    moveSlotToNearestWindow(target.id, addMs(blocker.plannedEnd, getRouteBufferMs()));
    return;
  }

  if (warning.type === "route" && slots.length >= 2 && warning.id.startsWith("sequence-")) {
    const previous = slots[0];
    const current = slots[1];
    moveSlotToNearestWindow(current.id, addMs(previous.plannedEnd, getRouteBufferMs()));
    return;
  }

  if (warning.type === "route" && warning.id.startsWith("wrong-workcenter-") && slots[0]) {
    const slot = slots[0];
    if (slot.locked) return;
    const step = planningState.routeSteps.find((item) => item.id === slot.routeStepId);
    if (!step) return;
    slot.workCenterId = step.workCenterId;
	    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity, planningState, slot.unitsPerHour || null, slot.boardsPerPanel || null, slot));
    slot.updatedAt = stamp;
    moveSlotToNearestWindow(slot.id, slot.plannedStart);
    return;
  }

  if (warning.type === "quantity" && slots[0]) {
    const slot = slots[0];
    if (slot.locked) return;
    const previous = getRouteNeighbor(slot, -1);
    if (!previous) return;
    slot.quantity = Math.min(normalizeQuantity(slot.quantity), normalizeQuantity(previous.quantity));
	    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity, planningState, slot.unitsPerHour || null, slot.boardsPerPanel || null, slot));
    slot.updatedAt = stamp;
    cascadeIfEnabled(slot.id);
    persistState();
    render();
    return;
  }

  if (warning.type === "duration" && slots[0]) {
    const slot = slots[0];
    if (slot.locked) return;
	    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity, planningState, slot.unitsPerHour || null, slot.boardsPerPanel || null, slot));
    slot.updatedAt = stamp;
    cascadeIfEnabled(slot.id);
    persistState();
    render();
    return;
  }

  if (warning.type === "route" && slots[0]) {
    openPlanningForProject(slots[0].projectId);
    return;
  }

  focusSlot(slots[0]?.id || "");
}

function savePlanSnapshot() {
  const key = "mes-planning-prototype-plan-snapshots-v1";
  const snapshots = JSON.parse(localStorage.getItem(key) || "[]");
  snapshots.unshift({
    id: makeId("snap"),
    createdAt: new Date().toISOString(),
    specifications: (directoryState.specifications || []).length,
    routes: planningState.routes.length,
    slots: planningState.slots.length,
    state: planningState,
  });
  localStorage.setItem(key, JSON.stringify(snapshots.slice(0, 8)));
  notifySaveSuccess("Снимок плана сохранен");
}

function updateSlotQuantity(slotId, value) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  if (slot.locked) return;

  const quantity = normalizeQuantity(value, slot.quantity);
  slot.quantity = quantity;
	  slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, quantity, planningState, slot.unitsPerHour || null, slot.boardsPerPanel || null, slot));
  slot.updatedAt = new Date().toISOString();
  cascadeIfEnabled(slotId);
  persistState();
  notifySaveSuccess("Количество операции сохранено");
  render();
}

function cycleSlotStatus(slotId) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  const index = SLOT_STATUSES.indexOf(slot.status);
  slot.status = SLOT_STATUSES[(index + 1) % SLOT_STATUSES.length];
  slot.updatedAt = new Date().toISOString();
  persistState();
  notifySaveSuccess("Статус операции сохранен");
  render();
}

function resetDemoState() {
  planningState = createDefaultPlanningState();
  ui.expandedProjects = new Set();
  ui.selectedSlotId = null;
  withPlanningEntityRemovalAllowed(() => persistState());
  render();
}

function deleteSlotConfirmed(slotId) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  planningState.slots = planningState.slots.filter((item) => item.id !== slotId);
  if (ui.selectedSlotId === slotId) ui.selectedSlotId = null;
  persistState();
  render();
}

function focusSlot(slotId) {
  if (!slotId) return;
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  ui.selectedSlotId = slotId;
  const route = getSlotRoute(slot);
  if (route?.id) ui.expandedProjects.add(route.id);
  else ui.expandedProjects.add(slot.projectId);
  render();

  requestAnimationFrame(() => {
    const element = app.querySelector(`[data-slot-id="${slotId}"]`);
    const shell = app.querySelector("[data-gantt-shell]");
    if (!element || !shell) return;
    element.scrollIntoView({ block: "center", inline: "center" });
    shell.scrollLeft = Math.max(0, shell.scrollLeft - LEFT_WIDTH / 2);
  });
}

function focusRoute(routeId) {
  const route = (planningState.routes || []).find((item) => item.id === routeId);
  if (!route) return;
  ui.expandedProjects.add(route.id);
  ui.activeRouteId = route.id;
  ui.activeProjectId = route.projectId || ui.activeProjectId || "";
  ui.search = "";
  const firstSlot = getRouteSlots(route.id)
    .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))[0];
  ui.selectedSlotId = firstSlot?.id || null;
  persistUiState();
  render();

  requestAnimationFrame(() => {
    const element = app.querySelector(`[data-row-id="route:${route.id}"]`);
    const shell = app.querySelector("[data-gantt-shell]");
    if (!element || !shell) return;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    shell.scrollLeft = Math.max(0, shell.scrollLeft - LEFT_WIDTH / 2);
  });
}

function focusProject(projectId) {
  if (!projectId || !getProject(projectId)) return;
  const route = getProjectRouteForModule(projectId);
  if (route) {
    focusRoute(route.id);
    return;
  }
  ui.expandedProjects.add(projectId);
  ui.search = "";
  const firstSlot = planningState.slots
    .filter((slot) => slot.projectId === projectId)
    .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))[0];
  ui.selectedSlotId = firstSlot?.id || null;
  persistUiState();
  render();

  requestAnimationFrame(() => {
    const element = app.querySelector(`[data-row-id="project:${projectId}"], [data-row-id^="route:"]`);
    const shell = app.querySelector("[data-gantt-shell]");
    if (!element || !shell) return;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    shell.scrollLeft = Math.max(0, shell.scrollLeft - LEFT_WIDTH / 2);
  });
}

function closeModals() {
  ui.editor = null;
  ui.splitSlotId = null;
  ui.projectModal = false;
  ui.directoryEditor = null;
  ui.confirmDialog = null;
  render();
}

function buildRows(scaleInfo) {
  const filteredRoutes = getVisibleGanttRoutes();
  const rows = [];

  for (const route of filteredRoutes) {
    const project = getProject(route.projectId);
    const routeExpanded = isGanttRouteExpanded(route);
    const routeSlots = getRouteSummarySlots(route.id);
    rows.push({
      id: `route:${route.id}`,
      type: "route",
      route,
      project,
      routeId: route.id,
      projectId: route.projectId,
      height: getScaledRowHeight(PROJECT_ROW_HEIGHT, routeSlots, scaleInfo, true),
    });

    if (!routeExpanded) continue;

    const centers = getRouteCenters(route.id);
    for (const center of centers) {
      if (!ganttCenterMatchesFilter(center)) continue;
      const routeSteps = getRouteStepsForModule(route.id);
      const inRoute = routeSteps.some((step) => step.workCenterId === getGanttCenterRouteWorkCenterId(center));
      rows.push({
        id: `work:${route.id}:${center.id}`,
        type: "workCenter",
        routeId: route.id,
        projectId: route.projectId,
        workCenterId: center.id,
        workCenter: center,
        parentWorkCenterId: center.parentWorkCenterId || center.id,
        smtLineId: center.smtLineId || "",
        isSmtLine: Boolean(center.isSmtLine),
        isOutsideRoute: !inRoute,
        height: WORK_ROW_HEIGHT,
      });

      getGanttResourcesForWorkCenter(getGanttCenterRouteWorkCenterId(center)).forEach((resource) => {
        const resourceSlots = getSlotsForRouteResource(route.id, getGanttCenterRouteWorkCenterId(center), resource.id);
        rows.push({
          id: getResourceRowId(route.id, getGanttCenterRouteWorkCenterId(center), resource.id),
          type: "resource",
          routeId: route.id,
          projectId: route.projectId,
          workCenterId: getGanttCenterRouteWorkCenterId(center),
          workCenter: getWorkCenter(getGanttCenterRouteWorkCenterId(center)) || center,
          resourceId: resource.id,
          resource,
          parentResourceId: resource.parentResourceId || "",
          isOutsideRoute: !inRoute,
          height: getScaledRowHeight(WORK_ROW_HEIGHT, resourceSlots, scaleInfo, false),
        });
      });
    }
  }

  return rows;
}

function buildRowLayout(rows) {
  let top = 0;
  const map = {};
  for (const row of rows) {
    map[row.id] = { top, height: row.height };
    top += row.height;
  }
  return { map, totalHeight: top };
}

function buildSlotPlacementMap(rows, scaleInfo) {
  return rows.reduce((map, row) => {
    map[row.id] = calculateSlotPlacements(getRowSlots(row), scaleInfo, row.type === "project" || row.type === "route").placements;
    return map;
  }, {});
}

function getScaledRowHeight(baseHeight, slots, scaleInfo, isAggregate) {
  if (slots.length < 2) return baseHeight;

  const { levelCount } = calculateSlotPlacements(slots, scaleInfo, isAggregate);
  const slotHeight = getSlotHeight(isAggregate);
  const slotTop = getSlotTop(isAggregate);
  const requiredHeight = slotTop * 2 + levelCount * slotHeight + Math.max(0, levelCount - 1) * WEEK_SLOT_GAP;
  return Math.max(baseHeight, Math.ceil(requiredHeight));
}

function calculateSlotPlacements(slots, scaleInfo, isAggregate = false) {
  const placements = {};
  const slotHeight = getSlotHeight(isAggregate);
  const slotTop = getSlotTop(isAggregate);
  const laneEnds = [];
  const sortedSlots = [...slots].sort((left, right) => (
    toDate(left.plannedStart) - toDate(right.plannedStart)
    || toDate(left.plannedEnd) - toDate(right.plannedEnd)
  ));

  for (const slot of sortedSlots) {
    const rect = getSlotVisualRect(slot, scaleInfo, isAggregate);
    let lane = laneEnds.findIndex((rightEdge) => rect.x >= rightEdge + WEEK_SLOT_GAP);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }

    laneEnds[lane] = rect.right;
    placements[slot.id] = {
      top: slotTop + lane * (slotHeight + WEEK_SLOT_GAP),
      height: slotHeight,
      level: lane,
      rect,
    };
  }

  return { placements, levelCount: laneEnds.length };
}

function getWeekSlotHeight(isAggregate) {
  return isAggregate ? 18 : WEEK_SLOT_HEIGHT;
}

function getSlotTop(isAggregate = false) {
  if (ui.scale === "weeks") return WEEK_SLOT_TOP;
  return isAggregate ? AGGREGATE_SLOT_TOP : STANDARD_SLOT_TOP;
}

function getSlotHeight(isAggregate = false) {
  if (ui.scale === "weeks") return getWeekSlotHeight(isAggregate);
  return isAggregate ? AGGREGATE_SLOT_HEIGHT : STANDARD_SLOT_HEIGHT;
}

function getSlotConnectionY(rowLayout, placement, isAggregate = false) {
  if (!rowLayout) return 0;
  const top = placement?.top ?? getSlotTop(isAggregate);
  const height = placement?.height ?? getSlotHeight(isAggregate);
  return rowLayout.top + top + height / 2;
}

function getProjectCenters(projectId) {
  const routeCenters = getProjectRouteSteps(projectId, planningState)
    .map((step) => getWorkCenter(step.workCenterId))
    .filter(Boolean);
  const slotCenters = planningState.slots
    .filter((slot) => slot.projectId === projectId)
    .map((slot) => getWorkCenter(slot.workCenterId))
    .filter(Boolean);
  const base = ui.rowMode === "all" ? getPlanningWorkCenters() : [...routeCenters, ...slotCenters];
  const seen = new Set();

  return base.filter((center) => {
    if (!center.isActive || seen.has(center.id)) return false;
    seen.add(center.id);
    return true;
  });
}

function getRouteCenters(routeId) {
  const routeSteps = getRouteStepsForModule(routeId);
  const routeCenters = routeSteps
    .map((step) => getWorkCenter(step.workCenterId))
    .filter(Boolean);
  const slotCenters = getRouteSlots(routeId)
    .map((slot) => getWorkCenter(slot.workCenterId))
    .filter(Boolean);
  const base = ui.rowMode === "all" ? getPlanningWorkCenters() : [...routeCenters, ...slotCenters];
  const seen = new Set();

  return base.filter((center) => {
    if (!center.isActive || seen.has(center.id)) return false;
    seen.add(center.id);
    return true;
  });
}

function getSlotsForProjectCenter(projectId, workCenterId) {
  return planningState.slots.filter((slot) => (
    slot.projectId === projectId
    && slot.workCenterId === workCenterId
  ));
}

function getRouteStepIds(routeId) {
  return new Set((planningState.routeSteps || [])
    .filter((step) => step.routeId === routeId)
    .map((step) => step.id));
}

function getSlotRoute(slot) {
  const step = (planningState.routeSteps || []).find((item) => item.id === slot?.routeStepId);
  if (step?.routeId) return (planningState.routes || []).find((route) => route.id === step.routeId) || null;
  return (planningState.routes || []).find((route) => route.projectId === slot?.projectId && route.isDefault)
    || (planningState.routes || []).find((route) => route.projectId === slot?.projectId)
    || null;
}

function getRouteSlots(routeId) {
  const stepIds = getRouteStepIds(routeId);
  return (planningState.slots || []).filter((slot) => stepIds.has(slot.routeStepId));
}

function getSlotsForRouteCenter(routeId, workCenterId) {
  const routeSlots = getRouteSlots(routeId);
  return routeSlots.filter((slot) => slot.workCenterId === workCenterId);
}

function getSlotsForRouteResource(routeId, workCenterId, resourceId) {
  return getSlotsForRouteCenter(routeId, workCenterId)
    .filter((slot) => getSlotGanttResourceId(slot) === resourceId);
}

function getGanttCenterRouteWorkCenterId(center) {
  return center?.parentWorkCenterId || (isSmtLineWorkCenterId(center?.id) ? "smt" : center?.id);
}

function ganttCenterMatchesFilter(center) {
  if (ui.workCenterFilter === "all") return true;
  if (center.id === ui.workCenterFilter) return true;
  return getGanttCenterRouteWorkCenterId(center) === ui.workCenterFilter;
}

function isFinishedGoodsSlot(slot) {
  const operationName = String(slot.operationName || "").toLowerCase();
  const outputName = String(slot.output || "").toLowerCase();
  return slot.workCenterId === "warehouse"
    || operationName.includes("склад")
    || operationName.includes("готов")
    || outputName.includes("готов");
}

function getProjectSummarySlots(projectId) {
  return planningState.slots.filter((slot) => (
    slot.projectId === projectId
    && isFinishedGoodsSlot(slot)
  ));
}

function getRouteSummarySlots(routeId) {
  return getRouteSlots(routeId).filter((slot) => isFinishedGoodsSlot(slot));
}

function projectMatchesFilters(project) {
  if (ui.statusFilter !== "all" && project.status !== ui.statusFilter) return false;

  if (ui.search.trim()) {
    const specification = getSpecificationByProjectId(project.id);
    const haystack = `${getProjectDisplayName(project)} ${getProjectDisplayOutput(project)} ${project.orderNumber} ${project.customer || ""} ${specification?.orderNumber || ""} ${specification?.customer || ""}`.toLowerCase();
    if (!haystack.includes(ui.search.trim().toLowerCase())) return false;
  }

  if (ui.workCenterFilter !== "all") {
    const hasRouteCenter = getProjectRouteSteps(project.id, planningState).some((step) => (
      step.workCenterId === ui.workCenterFilter
      || (ui.workCenterFilter === "smt" && step.workCenterId === "smt")
    ));
    const hasSlotCenter = isSmtLineWorkCenterId(ui.workCenterFilter)
      ? getSlotsForProjectCenter(project.id, ui.workCenterFilter).length > 0
      : planningState.slots.some((slot) => project.id === slot.projectId && slot.workCenterId === ui.workCenterFilter);
    if (!hasRouteCenter && !hasSlotCenter) return false;
  }

  return true;
}

function routeMatchesGanttFilters(route) {
  const project = getProject(route?.projectId);
  if (!route || !project) return false;
  if (ui.statusFilter !== "all" && project.status !== ui.statusFilter) return false;

  const specification = getRouteSpecification(route);
  if (ui.search.trim()) {
    const haystack = `${route.name || ""} ${specification?.name || ""} ${specification?.outputItem || ""} ${getProjectDisplayName(project)} ${getProjectDisplayOutput(project)} ${project.orderNumber || ""} ${project.customer || ""}`.toLowerCase();
    if (!haystack.includes(ui.search.trim().toLowerCase())) return false;
  }

  if (ui.workCenterFilter !== "all") {
    const hasRouteCenter = getRouteStepsForModule(route.id).some((step) => (
      step.workCenterId === ui.workCenterFilter
      || (ui.workCenterFilter === "smt" && step.workCenterId === "smt")
      || (isSmtLineWorkCenterId(ui.workCenterFilter) && step.workCenterId === "smt")
    ));
    const hasSlotCenter = getSlotsForRouteCenter(route.id, ui.workCenterFilter).length > 0;
    if (!hasRouteCenter && !hasSlotCenter) return false;
  }

  return true;
}

function getRowSlots(row) {
  if (row.type === "route") {
    return getRouteSummarySlots(row.routeId);
  }

  if (row.type === "project") {
    return getProjectSummarySlots(row.projectId);
  }

  if (row.type === "workCenter") {
    return [];
  }

  if (row.type === "resource") {
    return getSlotsForRouteResource(row.routeId, row.workCenterId, row.resourceId);
  }

  return planningState.slots.filter((slot) => (
    (!row.routeId || getSlotRoute(slot)?.id === row.routeId)
    && slot.projectId === row.projectId
    && getSlotGanttWorkCenterId(slot) === row.workCenterId
  ));
}

function getVisibleSlotRowId(slot) {
  const route = getSlotRoute(slot);
  if (!route) return null;
  if (!isGanttRouteExpanded(route)) {
    return isFinishedGoodsSlot(slot) ? `route:${route.id}` : null;
  }
  return getResourceRowId(route.id, slot.workCenterId, getSlotGanttResourceId(slot));
}

function buildStats(warnings) {
  return {
    specifications: (directoryState.specifications || []).length,
    routes: planningState.routes.length,
    slots: planningState.slots.length,
    critical: warnings.filter((warning) => warning.severity === "critical").length,
    warning: warnings.filter((warning) => warning.severity !== "critical").length,
  };
}

function getProject(id) {
  // Production context facade. The name stays for compatibility with the older
  // Gantt code, but it resolves a specification-centered production context.
  const legacyProject = (planningState.projects || []).find((project) => project.id === id);
  if (legacyProject) return legacyProject;
  const specification = getSpecificationByProjectId(id) || getSpecificationById(id);
  return getProductionContextForSpecification(specification);
}

function getProductionContexts() {
  return (directoryState.specifications || [])
    .map((specification) => getProductionContextForSpecification(specification))
    .filter(Boolean);
}

function getSpecificationByProjectId(projectId) {
  if (!projectId) return null;
  return (directoryState.specifications || []).find((specification) => (
    specification.id === projectId
    || specification.projectId === projectId
  )) || null;
}

function getProductionContextForSpecification(specification) {
  if (!specification) return null;
  return {
    id: specification.id,
    name: specification.outputItem || specification.name || "Спецификация",
    orderNumber: specification.orderNumber || "",
    customer: specification.customer || "",
    totalQuantity: normalizeOptionalPositiveInteger(specification.productionQuantity) || 1,
    dueDate: specification.dueDate || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
    status: PROJECT_STATUSES.includes(specification.productionStatus) ? specification.productionStatus : "planned",
    createdAt: specification.createdAt || "",
    updatedAt: specification.updatedAt || "",
    specificationId: specification.id,
    isSpecificationProduction: true,
  };
}

function getProjectDisplayName(project) {
  const specification = getSpecificationByProjectId(project?.id);
  return specification?.name || project?.name || "";
}

function getProjectDisplayOutput(project) {
  const specification = getSpecificationByProjectId(project?.id);
  return specification?.outputItem || project?.name || "";
}

function getBatch(id) {
  return planningState.batches.find((batch) => batch.id === id);
}

function getWorkCenter(id) {
  return getRuntimePlanningState()?.workCenters?.find((center) => center.id === id) || null;
}

function selected(left, right) {
  return left === right ? "selected" : "";
}

function cleanDateTime(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.length === 16 ? `${text}:00` : text;
}

function cleanOptionalDateTime(value) {
  const text = cleanDateTime(value);
  return text || "";
}

function makeId(prefix) {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function icon(name) {
  const icons = {
    search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>`,
    bug: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2l1.5 2.5M16 2l-1.5 2.5"></path><rect x="7" y="5" width="10" height="14" rx="5"></rect><path d="M3 9h4M17 9h4M3 14h4M17 14h4M12 5v14M8 19l-2 3M16 19l2 3"></path></svg>`,
    monitor: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path><path d="M7 10h3l2-3 2 6 2-3h1"></path></svg>`,
    book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z"></path><path d="M8 7h8M8 11h8"></path></svg>`,
    bom: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h3v3h-3z"></path><path d="M2 8h2M2 12h2M2 16h2M20 8h2M20 12h2M20 16h2M8 2v2M12 2v2M16 2v2M8 20v2M12 20v2M16 20v2"></path></svg>`,
    package: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"></path><path d="M4 7.5 12 12l8-4.5M12 12v9"></path><path d="m8 5.2 8 4.5"></path></svg>`,
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 3.6-.2-.1a1.7 1.7 0 0 0-2.1.2l-.2.1-3.2-1.8-.1-.3a1.7 1.7 0 0 0-1.6-1.1H10l-2.1-3.6.1-.2a1.7 1.7 0 0 0-.3-1.9L7.6 12l2.1-3.6.2.1a1.7 1.7 0 0 0 2.1-.2l.2-.1 3.2 1.8.1.3a1.7 1.7 0 0 0 1.6 1.1h.3l2.1 3.6Z"></path></svg>`,
    calculator: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M8 6h8M8 10h2M12 10h2M16 10h.01M8 14h2M12 14h2M16 14h.01M8 18h2M12 18h4"></path></svg>`,
    calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M8 2v4M16 2v4M3 10h18"></path></svg>`,
    gantt: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14M4 19h16"></path><path d="M8 7h9M8 12h5M12 17h8"></path><path d="M7 7h1M7 12h1M11 17h1"></path></svg>`,
    tree: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="7" height="5" rx="1.5"></rect><rect x="13" y="10" width="7" height="5" rx="1.5"></rect><rect x="13" y="17" width="7" height="4" rx="1.5"></rect><path d="M7.5 8v7a2 2 0 0 0 2 2H13M11 12h2M7.5 12H13"></path></svg>`,
    refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-5l-2 2"></path><path d="M4 4v4h4"></path><path d="M4 13a8 8 0 0 0 14 5l2-2"></path><path d="M20 20v-4h-4"></path></svg>`,
    reset: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`,
    minus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>`,
    chevronDown: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>`,
    chevronUp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"></path></svg>`,
    chevronRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`,
    alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.2 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4M12 17h.01"></path></svg>`,
    info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>`,
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>`,
    arrowLeft: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"></path></svg>`,
    arrowRight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>`,
    edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>`,
    play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"></path></svg>`,
    split: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h6a4 4 0 0 1 4 4v8"></path><path d="M14 14a4 4 0 0 1 4-4h2"></path><path d="m18 6 2 4-2 4"></path><path d="m12 16 2 2 2-2"></path></svg>`,
    trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="m19 6-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>`,
    save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"></path><path d="M17 21v-8H7v8M7 3v5h8"></path></svg>`,
    chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"></path><rect x="7" y="12" width="3" height="5" rx="1"></rect><rect x="12" y="8" width="3" height="9" rx="1"></rect><rect x="17" y="5" width="3" height="12" rx="1"></rect></svg>`,
    upload: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9"></path><path d="m7 14 5-5 5 5"></path><path d="M5 3h14"></path></svg>`,
    download: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>`,
    lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>`,
    unlock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M15 10V7a4 4 0 0 0-7-2.6"></path></svg>`,
  };
  return icons[name] || "";
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    ui.selectedSlotId = null;
    closeModals();
  }
});

window.addEventListener("click", (event) => {
  const updateReloadButton = event.target.closest?.("[data-update-reload]");
  if (updateReloadButton) {
    reloadForLatestUpdate(updateReloadButton.dataset.updateReload || "");
    return;
  }

  const updateDismissButton = event.target.closest?.("[data-update-dismiss]");
  if (updateDismissButton) {
    hideUpdateReadyNotice(updateDismissButton.dataset.updateDismiss || "");
    return;
  }

  const moduleButton = event.target.closest?.("[data-module]");
  if (!moduleButton || !app.contains(moduleButton)) return;
  navigateToModule(moduleButton.dataset.module);
});

window.addEventListener("beforeunload", () => {
  rememberScroll();
  persistUiState();
  persistCalculatorState();
  persistAuthState();
});
