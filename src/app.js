import { createDefaultPlanningState, createProjectBundle, routeTemplateOptions } from "./data.js";
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
  xToDate,
} from "./time.js";
import {
  byId,
  calculateProjectProgress,
  getDependencyPairs,
  getProjectRouteSteps,
  getSlotWarnings,
} from "./validation.js";

const STORAGE_KEY = "mes-planning-prototype-state-v1";
const UI_STORAGE_KEY = "mes-planning-prototype-ui-v1";
const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v1";
const CALCULATOR_STORAGE_KEY = "mes-planning-prototype-complexity-calculator-v4";
const AUTH_STORAGE_KEY = "mes-planning-prototype-auth-v1";
const APP_VERSION = "v.1.17";
const STORAGE_KEYS = [
  STORAGE_KEY,
  UI_STORAGE_KEY,
  DIRECTORY_STORAGE_KEY,
  CALCULATOR_STORAGE_KEY,
  AUTH_STORAGE_KEY,
];
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
const DEFAULT_RESOURCE_CPH = 30000;
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
};

const app = document.querySelector("#app");

const defaultUiState = {
  activeModule: "reports",
  activeDirectory: "projects",
  activeReport: "dashboard",
  activeProjectId: "",
  activeSpecificationId: "",
  activeBomId: "",
  activeRouteId: "",
  calculatorStep: "inputs",
  debugOverlay: null,
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
const BOM_IMPORT_COLUMN_COUNT = 9;
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

let planningState = loadState();
let directoryState = loadDirectoryState();
let calculatorState = loadCalculatorState();
let ui = loadUiState();
let authState = loadAuthState();

const directorySections = [
  { id: "departments", label: "Отделы", description: "Подразделения и зоны ответственности", count: () => directoryState.departments.length },
  { id: "roles", label: "Роли", description: "Гибкая настройка доступа к модулям и справочникам", count: () => directoryState.roles.length },
  { id: "resources", label: "Ресурсы", description: "Производственные мощности", count: () => directoryState.resources.length },
  { id: "componentTypes", label: "Типы компонентов", description: "Корпуса, коэффициенты и скорости установки", count: () => directoryState.componentTypes.length },
  { id: "employees", label: "Сотрудники", description: "Планировщики, мастера, операторы", count: () => directoryState.employees.length },
  { id: "equipment", label: "Оборудование", description: "Линии, установки и стенды", count: () => directoryState.equipment.length },
  { id: "workCenters", label: "Участки", description: "Производственные участки MES", count: () => planningState.workCenters.length },
  { id: "statuses", label: "Статусы", description: "Состояния проектов и операций", count: () => directoryState.statuses.length },
  { id: "norms", label: "Нормативы", description: "Смены, длительности и ограничения", count: () => directoryState.norms.length },
];

const reportSections = [
  { id: "dashboard", label: "Дашборд", description: "Операционный обзор цеха", count: () => getSlotWarnings(planningState).warnings.length },
  { id: "production", label: "Сводка производства", description: "Статусы, объем и готовность", count: () => planningState.slots.length },
  { id: "workload", label: "Загрузка участков", description: "Операции и часы по участкам", count: () => planningState.workCenters.length },
  { id: "deadlines", label: "Сроки и отклонения", description: "Сроки проектов и риски", count: () => planningState.projects.length },
  { id: "quality", label: "Проблемы и конфликты", description: "Предупреждения маршрутов и загрузки", count: () => getSlotWarnings(planningState).warnings.length },
  { id: "warehouse", label: "Склад и выпуск", description: "Финальные складские операции", count: () => planningState.slots.filter((slot) => slot.workCenterId === "warehouse").length },
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

  if (params.has("state-reset")) {
    STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  }

  if (!params.has("cache-reset")) return;

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

function createDefaultDirectoryState() {
  return {
  departments: [
    { id: "dep-smt", name: "SMT отдел", code: "SMT", owner: "Павел Ким", status: "Активен" },
    { id: "dep-tht", name: "THT отдел", code: "THT", owner: "Игорь Семенов", status: "Активен" },
    { id: "dep-mechanic", name: "Слесарный отдел", code: "MECH", owner: "Дмитрий Орлов", status: "Активен" },
    { id: "dep-programming", name: "Отдел программной подготовки изделий", code: "PROG", owner: "Анна Морозова", status: "Активен" },
    { id: "dep-qc", name: "ОТК", code: "QC", owner: "Мария Волкова", status: "Активен" },
    { id: "dep-manual-coating", name: "Отдел ручной лакировки", code: "COAT-M", owner: "Мария Волкова", status: "Активен" },
    { id: "dep-selective-coating", name: "Отдел селективной лакировки", code: "COAT-S", owner: "Игорь Семенов", status: "Активен" },
    { id: "dep-wash", name: "Отмывка", code: "WASH", owner: "Дмитрий Орлов", status: "Активен" },
  ],
  roles: [
    { id: "role-admin", name: "Администратор системы", code: "ADMIN", accessLevel: 100, modules: "*", directories: "*", permissions: "create, read, update, delete, approve, reset, debug, admin", status: "Активен" },
    { id: "role-planner", name: "Планировщик производства", code: "PLANNER", accessLevel: 70, modules: "reports, planning, calculator, projects, routes, bomLists, specifications, directories", directories: "resources, componentTypes, employees, equipment, workCenters, norms", permissions: "create, read, update, schedule, approve", status: "Активен" },
    { id: "role-engineer", name: "Инженер-технолог", code: "ENGINEER", accessLevel: 55, modules: "reports, calculator, projects, routes, bomLists, specifications, directories", directories: "resources, componentTypes, equipment, workCenters, norms", permissions: "read, update, calculate", status: "Активен" },
    { id: "role-operator", name: "Оператор участка", code: "OPERATOR", accessLevel: 35, modules: "reports, planning", directories: "resources, equipment, workCenters, statuses", permissions: "read, execute, comment", status: "Активен" },
    { id: "role-viewer", name: "Наблюдатель", code: "VIEWER", accessLevel: 10, modules: "reports, projects, routes, bomLists, specifications", directories: "statuses", permissions: "read", status: "Активен" },
  ],
  resources: [
    { id: "res-smt-1", name: "Линия SMT-1 · Hanwha S2/L2", type: "Линия", workCenter: "SMT-монтаж", capacity: "1 партия / смена", baseCph: 32000, efficiency: 88, changeoverMin: 18, status: "Доступен" },
    { id: "res-smt-2", name: "Линия SMT-2 · Hanwha S2", type: "Линия", workCenter: "SMT-монтаж", capacity: "1 партия / смена", baseCph: 28000, efficiency: 82, changeoverMin: 24, status: "Загружен" },
    { id: "res-aoi-offline", name: "Офлайн АОИ · Athena 10MP", type: "Инспектор", workCenter: "AOI-контроль", capacity: "2 партии / смена", baseCph: 0, efficiency: 92, changeoverMin: 8, status: "Доступен" },
    { id: "res-test", name: "Стенд функционального теста", type: "Стенд", workCenter: "Тестирование", capacity: "3 изделия / час", baseCph: 0, efficiency: 90, changeoverMin: 10, status: "Доступен" },
    { id: "res-manual-a", name: "Пост ручного монтажа A", type: "Рабочее место", workCenter: "Ручной монтаж", capacity: "2 оператора", baseCph: 0, efficiency: 80, changeoverMin: 5, status: "Доступен" },
  ],
  bomLists: [
    { id: "bom-x100", name: "BOM X100 PCB", projectId: "p-x100", boardCode: "PCB-X100", revision: "A.2", resultItem: "Смонтированная плата X100", c0402: 42, c0603: 36, c0805: 18, csot23: 6, csoic: 2, cqfn: 1, cbga: 0, cconnector: 3, status: "Активен" },
    { id: "bom-v2", name: "BOM Power V2 PCB", projectId: "p-v2", boardCode: "PCB-PWR-V2", revision: "B.1", resultItem: "Смонтированная плата питания V2", c0402: 28, c0603: 54, c0805: 22, csot23: 8, csoic: 3, cqfn: 2, cbga: 0, cconnector: 4, status: "Активен" },
    { id: "bom-mes-main", name: "BOM MES Main PCB", projectId: "p-mes", boardCode: "PCB-MES-MAIN", revision: "C.0", resultItem: "Смонтированная основная плата MES", c0402: 64, c0603: 48, c0805: 16, csot23: 10, csoic: 4, cqfn: 2, cbga: 1, cconnector: 5, status: "Активен" },
    { id: "bom-mes-io", name: "BOM MES IO PCB", projectId: "p-mes", boardCode: "PCB-MES-IO", revision: "A.4", resultItem: "Смонтированная плата ввода-вывода MES", c0402: 34, c0603: 30, c0805: 12, csot23: 5, csoic: 2, cqfn: 1, cbga: 0, cconnector: 8, status: "Активен" },
  ],
  specifications: [
    { id: "spec-x100", name: "СП X100", projectId: "p-x100", revision: "A", outputItem: "Плата управления X100", bomListA: "bom-x100", bomQtyA: 1, bomListB: "", bomQtyB: 0, extraItems: "Крепеж M3; этикетка; технологическая тара", status: "Активен" },
    { id: "spec-v2", name: "СП Контроллер питания V2", projectId: "p-v2", revision: "B", outputItem: "Контроллер питания V2", bomListA: "bom-v2", bomQtyA: 1, bomListB: "", bomQtyB: 0, extraItems: "Радиатор; корпусной винт; маркировка", status: "Активен" },
    { id: "spec-mes", name: "СП MES-001", projectId: "p-mes", revision: "C", outputItem: "Готовое изделие MES-001", bomListA: "bom-mes-main", bomQtyA: 1, bomListB: "bom-mes-io", bomQtyB: 2, extraItems: "Корпус IP54; кабельный ввод; DIN-крепление; шильдик", status: "Активен" },
    { id: "spec-t40", name: "СП Датчик T-40", projectId: "p-t40", revision: "A", outputItem: "Датчик телеметрии T-40", bomListA: "bom-v2", bomQtyA: 1, bomListB: "", bomQtyB: 0, extraItems: "Герметичный корпус; прокладка; комплект винтов", status: "Черновик" },
  ],
  componentTypes: [
    { id: "ct-0402", name: "Чип 0402", package: "0402", family: "R/C/L", coefficient: 0.85, placementsPerHour: 36000, setupSeconds: 12, defaultCount: 42, status: "Активен" },
    { id: "ct-0603", name: "Чип 0603", package: "0603", family: "R/C/L", coefficient: 1, placementsPerHour: 32000, setupSeconds: 12, defaultCount: 36, status: "Активен" },
    { id: "ct-0805", name: "Чип 0805", package: "0805", family: "R/C/L", coefficient: 1.15, placementsPerHour: 28000, setupSeconds: 12, defaultCount: 18, status: "Активен" },
    { id: "ct-sot23", name: "SOT-23 / SOD", package: "SOT-23", family: "Дискреты", coefficient: 1.55, placementsPerHour: 19000, setupSeconds: 18, defaultCount: 6, status: "Активен" },
    { id: "ct-soic", name: "SOIC / TSSOP", package: "SOIC/TSSOP", family: "Микросхемы", coefficient: 2.2, placementsPerHour: 12000, setupSeconds: 26, defaultCount: 2, status: "Активен" },
    { id: "ct-qfn", name: "QFN / DFN", package: "QFN", family: "Микросхемы", coefficient: 3.8, placementsPerHour: 6200, setupSeconds: 34, defaultCount: 1, status: "Активен" },
    { id: "ct-bga", name: "BGA", package: "BGA", family: "Микросхемы", coefficient: 5.5, placementsPerHour: 3600, setupSeconds: 45, defaultCount: 0, status: "Активен" },
    { id: "ct-connector", name: "Разъем / крупный корпус", package: "Connector", family: "Крупные", coefficient: 4.6, placementsPerHour: 4200, setupSeconds: 40, defaultCount: 3, status: "Активен" },
  ],
  employees: [
    { id: "emp-morozova", name: "Анна Морозова", roleId: "role-admin", role: "Планировщик", department: "Отдел программной подготовки изделий", shift: "День", password: "", status: "На смене" },
    { id: "emp-semenov", name: "Игорь Семенов", roleId: "role-planner", role: "Мастер THT", department: "THT отдел", shift: "День", password: "", status: "На смене" },
    { id: "emp-volkova", name: "Мария Волкова", roleId: "role-engineer", role: "Инженер ОТК", department: "ОТК", shift: "День", password: "", status: "Доступна" },
    { id: "emp-kim", name: "Павел Ким", roleId: "role-operator", role: "Оператор SMT", department: "SMT отдел", shift: "Ночь", password: "", status: "Резерв" },
  ],
  equipment: [
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
  ],
  norms: [
    { id: "norm-day", name: "Рабочая смена дневная", value: "08:00-20:00", scope: "Все участки", status: "Активен" },
    { id: "norm-night", name: "Рабочая смена ночная", value: "20:00-08:00", scope: "SMT / Тестирование", status: "Активен" },
    { id: "norm-buffer", name: "Буфер между операциями", value: "30 минут", scope: "Маршруты", status: "Активен" },
    { id: "norm-capacity", name: "Емкость участка MVP", value: "1 операция одновременно", scope: "Планирование", status: "Активен" },
  ],
  statuses: [
    ...PROJECT_STATUSES.map((status) => ({ id: `project-${status}`, name: PROJECT_STATUS_LABELS[status], type: "Проект", code: status, usage: "Карточка проекта" })),
    ...SLOT_STATUSES.map((status) => ({ id: `slot-${status}`, name: STATUS_LABELS[status], type: "Операция", code: status, usage: "Слот Gantt" })),
  ],
  };
}

render();
setInterval(() => {
  ui.now = new Date();
  updateClockOnly();
}, 30000);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizePlanningState(createDefaultPlanningState());
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return normalizePlanningState(createDefaultPlanningState());
    return normalizePlanningState(parsed);
  } catch {
    return normalizePlanningState(createDefaultPlanningState());
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(planningState));
}

function loadDirectoryState() {
  try {
    const raw = localStorage.getItem(DIRECTORY_STORAGE_KEY);
    if (!raw) return createDefaultDirectoryState();
    return normalizeDirectoryState(JSON.parse(raw));
  } catch {
    return createDefaultDirectoryState();
  }
}

function persistDirectoryState() {
  localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(directoryState));
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

function createDefaultCalculatorState() {
  return normalizeCalculatorState({
    ...defaultCalculatorState,
    componentCounts: {},
  });
}

function normalizeCalculatorState(state) {
  const project = planningState?.projects?.find((item) => item.id === state?.projectId) || null;
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
      directoryEditor: null,
      debugOverlay: null,
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
      activeReport: ui.activeReport,
      activeProjectId: ui.activeProjectId,
      activeSpecificationId: ui.activeSpecificationId,
      activeBomId: ui.activeBomId,
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
    timelineCounts: ui.timelineCounts,
    expandedProjects: [...ui.expandedProjects],
    scrollLeft: ui.scrollLeft,
    scrollTop: ui.scrollTop,
  }));
}

function normalizeDirectoryState(state) {
  const fallback = createDefaultDirectoryState();
  return Object.fromEntries(Object.entries(fallback).map(([sectionId, fallbackRows]) => {
    const sourceRows = Array.isArray(state?.[sectionId]) ? state[sectionId] : fallbackRows;
    const sourceIds = new Set(sourceRows.map((row) => row?.id).filter(Boolean));
    const rows = [
      ...sourceRows,
      ...fallbackRows.filter((row) => row?.id && !sourceIds.has(row.id)),
    ];
    return [sectionId, rows
      .filter((row) => !OBSOLETE_DIRECTORY_ROW_IDS[sectionId]?.has(row?.id))
      .filter((row) => !isBlankDirectoryRow(row))
      .map((row, index) => normalizeDirectoryRow(sectionId, {
        ...(fallbackRows.find((fallbackRow) => fallbackRow.id === row.id) || fallbackRows[index]),
        ...row,
        id: row.id || fallbackRows[index]?.id || `${sectionId}-${index + 1}`,
      }))];
  }));
}

function normalizeDirectoryRow(sectionId, row) {
  if (sectionId === "bomLists") {
    const importHeaders = Array.isArray(row.importHeaders) ? row.importHeaders : [];
    const importRows = Array.isArray(row.importRows) ? row.importRows : Array.isArray(row.items) ? row.items : [];
    return {
      ...row,
      projectId: row.projectId || "",
      importHeaders,
      importRows: importRows.map((item) => normalizeBomImportRow(item)),
      importedAt: row.importedAt || "",
      sourceFileName: row.sourceFileName || "",
      sourceSheetName: row.sourceSheetName || "",
      ...Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, Math.max(0, Math.round(Number(row[field.key] || 0)))])),
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
  const rawModules = String(row.modules || "reports").trim();
  if (rawModules === "*") return "*";
  const modules = parseAccessList(rawModules);
  if (modules.has("dashboard")) {
    modules.delete("dashboard");
    modules.add("reports");
  }
  if (roleAllowsValue(row.directories, "projects")) modules.add("projects");
  if (roleAllowsValue(row.directories, "specifications")) {
    modules.add("specifications");
  }
  if (modules.has("calculator") || modules.has("projects") || modules.has("specifications")) {
    modules.add("routes");
  }
  if (roleAllowsValue(row.directories, "bomLists") || modules.has("specifications")) {
    modules.add("bomLists");
  }
  const order = ["reports", "planning", "calculator", "projects", "routes", "bomLists", "specifications", "directories", "debug"];
  return order.filter((moduleId) => modules.has(moduleId)).join(", ") || "reports";
}

function normalizeRoleDirectoryList(value) {
  const rawDirectories = String(value || "statuses").trim();
  if (rawDirectories === "*") return "*";
  const directories = parseAccessList(rawDirectories);
  ["projects", "specifications", "bomLists", "routes"].forEach((sectionId) => directories.delete(sectionId));
  const order = ["departments", "roles", "resources", "componentTypes", "employees", "equipment", "workCenters", "statuses", "norms"];
  return order.filter((sectionId) => directories.has(sectionId)).join(", ") || "statuses";
}

function isBlankDirectoryRow(row) {
  if (!row || typeof row !== "object") return true;
  const meaningfulValues = Object.entries(row)
    .filter(([key]) => key !== "id" && key !== "status")
    .map(([, value]) => String(value ?? "").trim());
  return meaningfulValues.every((value) => !value);
}

function normalizePlanningState(state) {
  const warehouseCenter = {
    id: "warehouse",
    name: "Склад",
    code: "WH",
    description: "Финальное размещение готовой партии на складе",
    isActive: true,
  };

  if (!state.workCenters.some((center) => center.id === warehouseCenter.id)) {
    state.workCenters = [...state.workCenters, warehouseCenter];
  }

  state.workCenters = state.workCenters.map((center) => ({
    ...center,
    unitsPerHour: Number(center.unitsPerHour || WORK_CENTER_RATES[center.id] || 40),
    capacity: Math.max(1, Number(center.capacity || 1)),
    shift: center.shift || (center.id === "warehouse" ? "24/7" : "08:00-20:00"),
  }));

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
    const key = `${slot.projectId}:${slot.batchId}`;
    if (!map[key]) map[key] = [];
    map[key].push(slot);
    return map;
  }, {}));

  for (const slots of groups) {
    if (!slots.length || slots.some((slot) => slot.workCenterId === "warehouse")) continue;

    const latest = [...slots].sort((left, right) => toDate(right.plannedEnd) - toDate(left.plannedEnd))[0];
    const route = state.routes.find((item) => item.projectId === latest.projectId && item.isDefault)
      || state.routes.find((item) => item.projectId === latest.projectId);
    const warehouseStep = state.routeSteps.find((step) => step.routeId === route?.id && step.workCenterId === "warehouse");
    if (!warehouseStep) continue;

    const plannedStart = addMs(latest.plannedEnd, 60 * 60 * 1000);
    const quantity = normalizeQuantity(latest.quantity);
    const plannedEnd = calculatePlannedEndByQuantity(plannedStart, "warehouse", quantity, state);
    state.slots.push({
      id: `s-${latest.projectId}-${latest.batchId}-warehouse`,
      projectId: latest.projectId,
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
  return Number(center?.unitsPerHour || WORK_CENTER_RATES[workCenterId] || 40);
}

function normalizeQuantity(value, fallback = 1) {
  const quantity = Math.round(Number(value));
  if (Number.isFinite(quantity) && quantity > 0) return quantity;
  return Math.max(1, Math.round(Number(fallback) || 1));
}

function toSlotDateTime(value) {
  return `${isoLocal(value)}:00`;
}

function calculateRequiredDurationMs(workCenterId, quantity, state = null, unitsPerHourOverride = null) {
  const rate = Math.max(1, Number(unitsPerHourOverride || getWorkCenterUnitsPerHour(workCenterId, state)));
  const normalizedQuantity = normalizeQuantity(quantity);
  return Math.max(MIN_OPERATION_DURATION_MS, normalizedQuantity / rate * 60 * 60 * 1000);
}

function calculatePlannedEndByQuantity(plannedStart, workCenterId, quantity, state = null, unitsPerHourOverride = null) {
  return addMs(plannedStart, calculateRequiredDurationMs(workCenterId, quantity, state, unitsPerHourOverride));
}

function calculateQuantityByDuration(workCenterId, plannedStart, plannedEnd) {
  const durationHours = Math.max(0, toDate(plannedEnd) - toDate(plannedStart)) / (60 * 60 * 1000);
  return normalizeQuantity(durationHours * getWorkCenterUnitsPerHour(workCenterId));
}

function recalculateSlotEndByQuantity(slot, state = null) {
  const quantity = normalizeQuantity(slot.quantity);
  return {
    ...slot,
    quantity,
    plannedEnd: toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, quantity, state, slot.unitsPerHour)),
  };
}

function getRouteBufferMs() {
  return DEFAULT_ROUTE_BUFFER_MS;
}

function getWorkCenterCapacity(workCenterId) {
  const center = planningState.workCenters.find((item) => item.id === workCenterId);
  return Math.max(1, Number(center?.capacity || 1));
}

function getSlotStepOrder(slot) {
  return planningState.routeSteps.find((step) => step.id === slot.routeStepId)?.stepOrder ?? 9999;
}

function getOrderedBatchSlots(projectId, batchId) {
  return planningState.slots
    .filter((slot) => slot.projectId === projectId && slot.batchId === batchId)
    .sort((left, right) => (
      getSlotStepOrder(left) - getSlotStepOrder(right)
      || toDate(left.plannedStart) - toDate(right.plannedStart)
    ));
}

function getRouteNeighbor(slot, direction) {
  const orderedSlots = getOrderedBatchSlots(slot.projectId, slot.batchId);
  const index = orderedSlots.findIndex((item) => item.id === slot.id);
  if (index === -1) return null;
  return orderedSlots[index + direction] || null;
}

function getEarliestRouteStart(projectId, batchId, routeStepId) {
  const step = planningState.routeSteps.find((item) => item.id === routeStepId);
  const previousSlots = getOrderedBatchSlots(projectId, batchId)
    .filter((slot) => getSlotStepOrder(slot) < Number(step?.stepOrder || 0));
  const previous = previousSlots[previousSlots.length - 1];
  if (previous) return addMs(previous.plannedEnd, getRouteBufferMs());
  return fromDateInput(ui.windowStart);
}

function getPlannedStepIds(projectId, batchId) {
  return new Set(planningState.slots
    .filter((slot) => slot.projectId === projectId && slot.batchId === batchId)
    .map((slot) => slot.routeStepId));
}

function buildBacklogItems(limit = 14) {
  const items = [];
  const projects = planningState.projects.filter((project) => projectMatchesFilters(project));

  for (const project of projects) {
    const routeSteps = getProjectRouteSteps(project.id, planningState).filter((step) => step.isRequired);
    const batches = planningState.batches.filter((batch) => batch.projectId === project.id);

    for (const batch of batches) {
      const plannedStepIds = getPlannedStepIds(project.id, batch.id);
      const nextStep = routeSteps.find((step) => (
        !plannedStepIds.has(step.id)
        && (step.workCenterId !== "warehouse" || plannedStepIds.size > 0)
      ));
      if (!nextStep) continue;

      const quantity = normalizeQuantity(batch.quantity);
      const earliestStart = getEarliestRouteStart(project.id, batch.id, nextStep.id);
      const durationMs = calculateRequiredDurationMs(nextStep.workCenterId, quantity, planningState, nextStep.unitsPerHour || null);
      const window = findFreeWindow(nextStep.workCenterId, durationMs, earliestStart);
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

function isWindowAvailable(workCenterId, start, end, excludeSlotId = null) {
  const capacity = getWorkCenterCapacity(workCenterId);
  const relevantSlots = planningState.slots.filter((slot) => (
    slot.workCenterId === workCenterId
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

function findFreeWindow(workCenterId, durationMs, earliestStart, excludeSlotId = null) {
  const snapMs = getGanttSnapMs();
  let candidateStart = snapDate(earliestStart, snapMs);
  const maxIterations = 160;

  for (let index = 0; index < maxIterations; index += 1) {
    const candidateEnd = addMs(candidateStart, durationMs);
    if (isWindowAvailable(workCenterId, candidateStart, candidateEnd, excludeSlotId)) {
      return { start: candidateStart, end: candidateEnd };
    }

    const overlappingSlots = planningState.slots
      .filter((slot) => (
        slot.workCenterId === workCenterId
        && slot.id !== excludeSlotId
        && windowsOverlap(candidateStart, candidateEnd, slot.plannedStart, slot.plannedEnd)
      ))
      .sort((left, right) => toDate(left.plannedEnd) - toDate(right.plannedEnd));

    candidateStart = snapDate(addMs(overlappingSlots[0]?.plannedEnd || candidateEnd, getRouteBufferMs()), snapMs);
  }

  return { start: candidateStart, end: addMs(candidateStart, durationMs) };
}

function getGanttSnapMs() {
  return GANTT_SNAP_MS;
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
  return planningState.projects.filter((project) => projectMatchesFilters(project));
}

function areAllVisibleProjectsExpanded() {
  const projects = getVisiblePlanningProjects();
  return projects.length > 0 && projects.every((project) => ui.expandedProjects.has(project.id));
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

  const orderedSlots = getOrderedBatchSlots(changedSlot.projectId, changedSlot.batchId);
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
      const durationMs = calculateRequiredDurationMs(current.workCenterId, current.quantity, planningState, current.unitsPerHour || null);
      const window = findFreeWindow(current.workCenterId, durationMs, earliestStart, current.id);
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

  if (ui.activeModule === "projects") {
    app.innerHTML = `
      <main class="app-shell project-app-shell" data-layout="app-shell" data-layout-page="projects">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderProjectsPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindProjectsEvents();
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

  if (ui.activeModule === "specifications") {
    app.innerHTML = `
      <main class="app-shell specification-app-shell" data-layout="app-shell" data-layout-page="specifications">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderSpecificationsPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindSpecificationsEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "reports") {
    app.innerHTML = `
      <main class="app-shell report-app-shell" data-layout="app-shell" data-layout-page="reports">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderReportsPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindReportEvents();
    bindConfirmEvents();
    return;
  }

  if (ui.activeModule === "debug") {
    app.innerHTML = `
      <main class="app-shell debug-app-shell" data-layout="app-shell" data-layout-page="debug">
        ${renderModuleMenu()}
        ${renderAppTopbar()}
        ${renderDebugPage()}
        ${renderConfirmModal()}
      </main>
    `;
    bindGlobalNavigation();
    bindDebugEvents();
    bindConfirmEvents();
    return;
  }

  const scaleStart = fromDateInput(ui.windowStart);
  const scaleInfo = buildTimeScale(ui.scale, scaleStart, getTimelineCount(ui.scale, scaleStart));
  const rows = buildRows(scaleInfo);
  const rowLayout = buildRowLayout(rows);
  const slotPlacementMap = buildSlotPlacementMap(rows, scaleInfo);
  const warningsContext = getSlotWarnings(planningState);
  const stats = buildStats(warningsContext.warnings);

  app.innerHTML = `
    <main class="app-shell planning-app-shell" data-layout="app-shell" data-layout-page="planning">
      ${renderModuleMenu()}
      ${renderAppTopbar()}
      ${renderToolbar(scaleInfo, stats)}
      <section class="planner-workspace planner-workspace-gantt-only" data-layout="planning-page" aria-label="Рабочая область планирования">
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

function getAuthEmployee() {
  return (directoryState.employees || []).find((employee) => employee.id === authState.employeeId) || null;
}

function getEmployeeRole(employee = getAuthEmployee()) {
  return (directoryState.roles || []).find((role) => role.id === employee?.roleId)
    || (directoryState.roles || []).find((role) => role.id === "role-viewer")
    || (directoryState.roles || [])[0]
    || null;
}

function getRoleName(roleId) {
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
    { id: "reports", label: "Отчеты", icon: "chart" },
    { id: "planning", label: "Планирование", icon: "calendar" },
    { id: "calculator", label: "Калькулятор", icon: "calculator" },
    { id: "projects", label: "Проекты", icon: "book" },
    { id: "routes", label: "Маршруты", icon: "split" },
    { id: "bomLists", label: "BOM-листы", icon: "book" },
    { id: "specifications", label: "Спецификации", icon: "book" },
    { id: "directories", label: "Справочники", icon: "book" },
    { id: "debug", label: "Отладка", icon: "bug" },
  ];
}

function getModuleGroups(modules) {
  const groupMap = [
    { label: "Аналитика", ids: ["reports"] },
    { label: "Производство", ids: ["planning", "projects"] },
    { label: "Технологии", ids: ["calculator", "routes", "bomLists", "specifications"] },
    { label: "Система", ids: ["directories", "debug"] },
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
    || (moduleItem.id === "reports" && roleAllowsValue(role?.modules, "dashboard"))
  ));
  return modules.length ? modules : getModuleDefinitions().filter((moduleItem) => moduleItem.id === "reports");
}

function ensureAuthorizedModule() {
  if (ui.activeModule === "dashboard") {
    ui.activeModule = "reports";
    ui.activeReport = "dashboard";
  }
  const availableModules = getAvailableModules();
  if (!availableModules.some((moduleItem) => moduleItem.id === ui.activeModule)) {
    ui.activeModule = availableModules[0]?.id || "reports";
  }
}

function getVisibleDirectorySections() {
  const role = getEmployeeRole();
  const visibleSections = directorySections.filter((section) => roleAllowsValue(role?.directories, section.id));
  return visibleSections.length ? visibleSections : directorySections.filter((section) => section.id === "departments");
}

function renderAuthPage() {
  const employees = (directoryState.employees || []).filter((employee) => employee.status !== "Уволен");
  const defaultEmployee = employees.find((employee) => employee.roleId === "role-admin") || employees[0];

  return `
    <main class="auth-shell" aria-label="Авторизация MES">
      <section class="auth-card">
        <div class="auth-card-head">
          <span class="eyebrow">Авторизация</span>
          <h1>Вход по ФИО</h1>
          <p>Для отладки пароль у всех сотрудников пока пустой. Оставьте поле пароля пустым и выберите сотрудника.</p>
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
            <input name="password" type="password" placeholder="Пустой пароль для MVP" autocomplete="current-password" />
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
              <button class="module-tab ${ui.activeModule === moduleItem.id ? "is-active" : ""}" data-module="${moduleItem.id}" type="button">
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
  const activeContext = ui.activeModule === "reports"
    ? reportSections.find((section) => section.id === ui.activeReport)?.label || "Дашборд"
    : ui.activeModule === "directories"
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
        <input type="search" placeholder="Поиск по проектам, операциям, справочникам" aria-label="Глобальный поиск" />
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

function renderDashboardPage({ embedded = false } = {}) {
  const data = getDashboardData();
  return `
    <section class="dashboard-page ${embedded ? "is-embedded" : ""}" aria-label="Дашборд производства">
      <div class="dashboard-control-room">
        <header class="dashboard-header">
          <div>
            <span class="eyebrow">Операционный обзор</span>
            <h1>Производственный дашборд</h1>
            <p>Оперативная картина плана, загрузки участков, складского выхода и предупреждений.</p>
          </div>
          <div class="dashboard-time">
            ${icon("clock")}
            <strong>${formatDateTime(ui.now)}</strong>
            <span>актуальное состояние</span>
          </div>
        </header>

        <div class="dashboard-grid">
          <section class="scada-panel scada-overview">
            <div class="scada-panel-head">
              <strong>Состояние контура</strong>
              <span>${data.criticalCount ? "критично" : "норма"}</span>
            </div>
            <div class="scada-metrics">
              ${data.metrics.map((metric) => `
                <article class="scada-metric ${metric.tone}">
                  <span>${escapeHtml(metric.label)}</span>
                  <strong>${escapeHtml(metric.value)}</strong>
                  <small>${escapeHtml(metric.caption)}</small>
                </article>
              `).join("")}
            </div>
          </section>

          <section class="scada-panel scada-mimic-panel">
            <div class="scada-panel-head">
              <strong>SMT линии и оборудование</strong>
              <span>2 линии + офлайн АОИ</span>
            </div>
            <div class="scada-mimic scada-equipment-mimic">
              ${data.smtLines.map((line) => renderDashboardSmtLine(line)).join("")}
            </div>
          </section>

          <section class="scada-panel scada-workcenters">
            <div class="scada-panel-head">
              <strong>Участки и загрузка</strong>
              <span>${data.workCenters.length} участков</span>
            </div>
            <div class="scada-node-grid">
              ${data.workCenters.map((center) => `
                <article class="scada-node ${center.tone}">
                  <div class="scada-node-top">
                    <span>${escapeHtml(center.code)}</span>
                    <em>${escapeHtml(center.state)}</em>
                  </div>
                  <strong>${escapeHtml(center.name)}</strong>
                  <div class="scada-load"><i style="width:${center.loadPercent}%;"></i></div>
                  <small>${center.hours} ч · ${center.slots} оп. · ${center.quantity.toLocaleString("ru-RU")} шт.</small>
                </article>
              `).join("")}
            </div>
          </section>

          <details class="scada-panel scada-alarms">
            <summary class="scada-panel-head">
              <strong>Предупреждения</strong>
              <span>${data.alarms.length} событий · свернуто</span>
            </summary>
            <div class="scada-alarm-list">
              ${data.alarms.length ? data.alarms.map((alarm) => `
                <article class="scada-alarm ${alarm.severity}">
                  <span>${escapeHtml(alarm.type)}</span>
                  <strong>${escapeHtml(alarm.project)}</strong>
                  <p>${escapeHtml(alarm.message)}</p>
                </article>
              `).join("") : `
                <article class="scada-alarm ok">
                  <span>OK</span>
                  <strong>Предупреждений нет</strong>
                  <p>Контур планирования не содержит активных критичных сообщений.</p>
                </article>
              `}
            </div>
          </details>

          <section class="scada-panel scada-projects">
            <div class="scada-panel-head">
              <strong>Проекты и сроки</strong>
              <span>портфель</span>
            </div>
            <div class="scada-project-list">
              ${data.projects.map((project) => `
                <article class="scada-project ${project.tone}">
                  <div>
                    <strong>${escapeHtml(project.name)}</strong>
                    <span>${escapeHtml(project.order)} · ${escapeHtml(project.due)}</span>
                  </div>
                  <em>${project.progress}%</em>
                  <div class="scada-progress"><i style="width:${project.progress}%;"></i></div>
                </article>
              `).join("")}
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderDashboardSmtLine(line) {
  return `
    <article class="smt-line-card ${line.tone}">
      <div class="smt-line-head">
        <div>
          <span>${escapeHtml(line.code)}</span>
          <strong>${escapeHtml(line.name)}</strong>
        </div>
        <em>${escapeHtml(line.state)}</em>
      </div>
      <div class="smt-line-rail" style="--station-count:${line.stations.length};" aria-label="${escapeAttribute(line.name)}">
        ${line.stations.map((station, index) => `
          <div class="smt-station ${station.kind} ${station.tone}">
            <div class="smt-machine-figure" aria-hidden="true">
              <i></i><b></b><span></span>
            </div>
            <strong>${escapeHtml(station.label)}</strong>
            <small>${escapeHtml(station.equipment)}</small>
            <em>${escapeHtml(station.state)}</em>
            ${index < line.stations.length - 1 ? `<mark></mark>` : ""}
          </div>
        `).join("")}
      </div>
      <div class="smt-line-footer">
        <span>Загрузка <b>${line.load}%</b></span>
        <div class="scada-load"><i style="width:${line.load}%;"></i></div>
        <span>${escapeHtml(line.project)}</span>
      </div>
    </article>
  `;
}

function getDashboardData() {
  const warnings = getSlotWarnings(planningState).warnings;
  const slotHours = planningState.slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0);
  const completedSlots = planningState.slots.filter((slot) => slot.status === "completed").length;
  const warehouseSlots = planningState.slots.filter((slot) => slot.workCenterId === "warehouse");
  const warehouseQuantity = warehouseSlots.reduce((sum, slot) => sum + Number(slot.quantity || 0), 0);
  const criticalCount = warnings.filter((warning) => warning.severity === "critical").length;
  const warningCount = warnings.length - criticalCount;
  const activeSlots = planningState.slots.filter((slot) => slot.status === "in_progress").length;
  const completionPercent = planningState.slots.length
    ? Math.round(completedSlots / planningState.slots.length * 100)
    : 0;

  const workCenterRows = planningState.workCenters.map((center) => {
    const slots = planningState.slots.filter((slot) => slot.workCenterId === center.id);
    const hours = Math.round(slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0) * 10) / 10;
    const centerWarnings = warnings.filter((warning) => warning.workCenterId === center.id);
    const hasCritical = centerWarnings.some((warning) => warning.severity === "critical");
    return {
      id: center.id,
      code: center.code,
      name: center.name,
      slots: slots.length,
      hours,
      quantity: slots.reduce((sum, slot) => sum + Number(slot.quantity || 0), 0),
      tone: hasCritical ? "critical" : centerWarnings.length ? "warning" : slots.some((slot) => slot.status === "in_progress") ? "active" : "ok",
      state: hasCritical ? "Критично" : centerWarnings.length ? "Риск" : slots.some((slot) => slot.status === "in_progress") ? "В работе" : "Готов",
    };
  });
  const maxHours = Math.max(1, ...workCenterRows.map((row) => row.hours));
  const workCenters = workCenterRows.map((row) => ({
    ...row,
    loadPercent: Math.max(4, Math.round(row.hours / maxHours * 100)),
  }));

  const lineOrder = ["smt", "aoi", "wash", "manual", "test", "coating", "assembly", "warehouse"];
  const lineNodes = lineOrder
    .map((id) => workCenters.find((center) => center.id === id))
    .filter(Boolean)
    .map((center) => ({
      code: center.code,
      label: center.name,
      status: center.state,
      tone: center.tone,
    }));

  const smtCenter = workCenters.find((center) => center.id === "smt");
  const aoiCenter = workCenters.find((center) => center.id === "aoi");
  const smtLines = [
    {
      code: "SMT-01",
      name: "Линия SMT-1",
      state: smtCenter?.state || "Готов",
      tone: smtCenter?.tone || "active",
      load: Math.max(18, smtCenter?.loadPercent || 74),
      project: "MES-001 · основная плата",
      stations: [
        { kind: "loader", label: "Загрузчик", equipment: "LDC 460XL", state: "подача", tone: "ok" },
        { kind: "conveyor", label: "Инсп. конвейер", equipment: "CYB 460XL-600", state: "инспекция", tone: "ok" },
        { kind: "mounter", label: "Установщик", equipment: "Hanwha S2", state: "монтаж", tone: "active" },
        { kind: "mounter", label: "Установщик", equipment: "Hanwha L2", state: "монтаж", tone: "active" },
        { kind: "conveyor", label: "Конвейер", equipment: "CYB 460XL-600", state: "транспорт", tone: "ok" },
        { kind: "oven", label: "Печь", equipment: "JTR-800", state: "профиль", tone: "ok" },
      ],
    },
    {
      code: "SMT-02",
      name: "Линия SMT-2",
      state: "Переналадка",
      tone: "warning",
      load: 52,
      project: "Power V2 · плата питания",
      stations: [
        { kind: "loader", label: "Ручная подача", equipment: "Стол подачи ПП", state: "оператор", tone: "ok" },
        { kind: "conveyor", label: "Конвейер", equipment: "CYB 460XL-600", state: "транспорт", tone: "ok" },
        { kind: "mounter", label: "Установщик", equipment: "Hanwha S2", state: "фидеры", tone: "warning" },
        { kind: "oven", label: "Печь", equipment: "NoName", state: "нагрев", tone: "active" },
        { kind: "aoi", label: "АОИ", equipment: "QUICK A300T", state: aoiCenter?.state || "готов", tone: aoiCenter?.tone || "ok" },
      ],
    },
    {
      code: "AOI-OFF",
      name: "Офлайн инспектор АОИ",
      state: aoiCenter?.state || "Готов",
      tone: aoiCenter?.tone || "ok",
      load: Math.max(12, Math.round((aoiCenter?.loadPercent || 38) * 0.72)),
      project: "Выборочный и финальный контроль",
      stations: [
        { kind: "aoi offline", label: "АОИ 3D", equipment: "Athena 10MP", state: "офлайн", tone: aoiCenter?.tone || "ok" },
      ],
    },
  ];

  const projects = buildDeadlineRows().map((row) => ({
    name: row.project,
    order: row.order,
    due: row.due,
    progress: row.progress,
    tone: row.progress < 35 ? "warning" : row.progress > 70 ? "ok" : "active",
  }));

  return {
    criticalCount,
    warningCount,
    metrics: [
      { label: "Проекты", value: String(planningState.projects.length), caption: "в производстве", tone: "active" },
      { label: "Операции", value: String(planningState.slots.length), caption: `${activeSlots} в работе`, tone: "active" },
      { label: "Плановые часы", value: formatReportNumber(slotHours), caption: "суммарная длительность", tone: "ok" },
      { label: "Готовность", value: `${completionPercent}%`, caption: `${completedSlots}/${planningState.slots.length} закрыто`, tone: completionPercent > 70 ? "ok" : "active" },
      { label: "Склад", value: warehouseQuantity.toLocaleString("ru-RU"), caption: `${warehouseSlots.length} финальных операций`, tone: "ok" },
      { label: "Сигналы", value: String(warnings.length), caption: `${criticalCount} крит. · ${warningCount} пред.`, tone: criticalCount ? "critical" : warningCount ? "warning" : "ok" },
    ],
    workCenters,
    lineNodes,
    smtLines,
    projects,
    alarms: warnings.slice(0, 8).map((warning) => ({
      type: warning.severity === "critical" ? "Критично" : "Риск",
      severity: warning.severity,
      project: getProject(warning.projectId)?.name || "План",
      message: warning.message,
    })),
  };
}

function renderCalculatorPage() {
  const calc = calculateComplexityResult();
  const inputStatus = getCalculatorInputStatus(calc);
  const routeReady = calc.operationResults.length > 0;
  const projectSpecs = calc.project
    ? (directoryState.specifications || []).filter((specification) => specification.projectId === calc.project.id)
    : (directoryState.specifications || []);
  const bomSource = getCalculatorBomSource(calc.project, calc.specification, calculatorState.noSpecification);
  const projectOptions = [
    { value: "", label: "Выберите проект", meta: "заказ и срок" },
    { value: "__create_project__", label: "Создать новый проект", meta: "Wizard Modal", action: "createProject" },
    ...planningState.projects.map((project) => ({ value: project.id, label: project.name, meta: project.orderNumber })),
  ];
  const specificationOptions = [
    { value: "", label: calculatorState.noSpecification ? "Без спецификации" : "Выберите спецификацию", meta: calculatorState.noSpecification ? "результат проекта = выбранный BOM" : "состав изделия" },
    { value: "__create_specification__", label: "Создать спецификацию", meta: calc.project ? "для выбранного проекта" : "сначала выберите проект", action: "createSpecification" },
    ...projectSpecs.map((specification) => ({ value: specification.id, label: specification.name, meta: `рев. ${specification.revision || "-"}` })),
  ];
  const bomOptions = [
    { value: "", label: calc.project ? "Выберите BOM" : "Сначала выберите проект", meta: calc.specification && !calculatorState.noSpecification ? "из спецификации" : "привязан к проекту" },
    ...bomSource.map((bom) => ({ value: bom.id, label: bom.name, meta: bom.resultItem || bom.boardCode || "" })),
  ];
  const selectedOperation = calc.selectedOperation;
  const selectedResources = getResourcesForWorkCenter(selectedOperation?.workCenterId);
  const workCenterOptions = planningState.workCenters.map((center) => ({ value: center.id, label: center.name, meta: center.code || "участок" }));
  const calculationTypeOptions = [
    { value: "components", label: "По компонентам", meta: "BOM и скорости установки" },
    { value: "manual", label: "Норматив на мультипликацию", meta: "ручное время операции" },
  ];
  const resourceOptions = selectedResources.length
    ? selectedResources.map((resource) => ({ value: resource.id, label: resource.name, meta: resource.status || "ресурс" }))
    : [{ value: "", label: "Нет ресурсов участка", meta: "проверьте справочник" }];
  const isComponentOperation = selectedOperation?.calculationType === "components";
  const bomOperationResult = calc.selectedResult?.calculationType === "components"
    ? calc.selectedResult
    : calc.operationResults.find((operation) => operation.bomListId === calc.bomList?.id)
      || calc.operationResults.find((operation) => operation.calculationType === "components")
      || calc.selectedResult;
  const bomRows = inputStatus.complete ? ((bomOperationResult?.componentRows?.length ? bomOperationResult.componentRows : buildBomPreviewRows(calc))) : [];
  const bomActiveTypes = bomRows.filter((row) => row.count > 0).length;
  const bomComponentsPerBoard = bomRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const bomTotalPlacements = bomRows.reduce((sum, row) => sum + Number(row.totalPlacements || 0), 0);
  const inputSaveReady = inputStatus.complete;
  const inputSaveCaption = calculatorState.inputsSavedAt
    ? `сохранено ${formatDateTime(calculatorState.inputsSavedAt)}`
    : "зафиксируйте вводные перед маршрутом";
  const activeCalculatorStep = getActiveCalculatorStep(calc);
  const visibleAttr = (blockId) => isCalculatorBlockVisible(activeCalculatorStep, blockId) ? "" : " hidden";

  return `
    <section class="calculator-page" data-layout="main-content" aria-label="Маршрутная карта и калькулятор операций">
      <div class="calculator-workspace" data-layout="page-workspace">
        <header class="calculator-header">
          <div>
            <span class="eyebrow">До планирования Gantt</span>
            <h1>Маршрутная карта и расчет операций</h1>
            <p>Сначала собираем маршрут, считаем время одной мультипликации по каждой операции, затем передаем маршрут в планирование.</p>
          </div>
          <div class="calculator-header-metrics">
            <span class="status-pill neutral">${calc.operationResults.length} операций</span>
            <span class="status-pill neutral">${calc.panelCount.toLocaleString("ru-RU")} мультипл.</span>
            <span class="status-pill ok">${formatDuration(calc.totalMs)}</span>
          </div>
        </header>

        <div class="calculator-grid">
          <aside class="calculator-panel calculator-process-panel">
            ${renderCalculatorProcessStepper(calc)}
          </aside>

          <div class="calculator-stack">
          <section class="calculator-panel calculator-input-panel" data-calculator-block="inputs"${visibleAttr("inputs")}>
            <div class="report-card-head">
              <strong>01 · Входные данные</strong>
              <span>${inputStatus.complete ? "готово к маршрутной карте" : "заполните все поля слева направо"}</span>
            </div>
            <div class="calculator-form-grid calculator-input-grid">
              <div class="field">
                <span>Проект</span>
                ${renderDenseInlineSelect("projectId", calculatorState.projectId, projectOptions, { type: "calc" })}
              </div>
              <div class="field">
                <span>Спецификация изделия</span>
                ${renderDenseInlineSelect("specificationId", calculatorState.specificationId, specificationOptions, { type: "calc" })}
              </div>
              <label class="field checkbox-field calculator-checkbox-field">
                <span>Режим спецификации</span>
                <div>
                  <input data-calculator-no-specification type="checkbox" ${calculatorState.noSpecification ? "checked" : ""} />
                  <strong>Без спецификации</strong>
                  <small>проект = смонтированная печатная плата из BOM</small>
                </div>
              </label>
              <div class="field">
                <span>BOM для SMT-операции</span>
                ${renderDenseInlineSelect("bomListId", calculatorState.bomListId, bomOptions, { type: "calc" })}
              </div>
              <label class="field">
                <span>Плат в заказе</span>
                <input data-calc-number="boardQuantity" type="number" min="1" step="1" value="${calculatorState.boardQuantity === "" ? "" : calc.boardQuantity}" placeholder="${calc.project?.totalQuantity ? calc.project.totalQuantity.toLocaleString("ru-RU") : "введите"}" />
              </label>
              <label class="field">
                <span>Плат в мультипликации</span>
                <input data-calc-number="boardsPerPanel" type="number" min="1" step="1" value="${calculatorState.boardsPerPanel === "" ? "" : calc.boardsPerPanel}" placeholder="например 4" />
              </label>
              <label class="field readonly">
                <span>Мультипликаций</span>
                <input readonly value="${calc.panelCount.toLocaleString("ru-RU")} шт." />
              </label>
              <div class="spec-link-summary full">
                <strong>${escapeHtml(calculatorState.noSpecification ? calc.bomList?.resultItem || "Проект без спецификации" : calc.specification?.outputItem || "Спецификация не выбрана")}</strong>
                <span>${escapeHtml(calculatorState.noSpecification ? buildNoSpecificationSummary(calc) : buildSpecificationSummary(calc.specification))}</span>
                <em>${inputStatus.complete
                  ? `${calc.boardQuantity.toLocaleString("ru-RU")} плат / ${calc.boardsPerPanel.toLocaleString("ru-RU")} плат в мультипликации = ${calc.panelCount.toLocaleString("ru-RU")} запусков маршрута`
                  : "После заполнения всех вводных появится расчет мультипликаций и можно будет сформировать маршрут."}</em>
              </div>
            </div>
            <div class="calculator-panel-actions calculator-input-actions">
              <span>${escapeHtml(inputSaveCaption)}</span>
              <button class="secondary-button" data-save-calculator-inputs type="button" ${inputSaveReady ? "" : "disabled"}>${icon("save")}<span>Сохранить входные данные</span></button>
            </div>
          </section>

          ${renderSpecificationBomPlan(calc, visibleAttr("specBom"))}

          <section class="calculator-panel calculator-result-panel" data-calculator-block="summary"${visibleAttr("summary")}>
            <div class="report-card-head">
              <strong>03 · Сводка маршрутной карты</strong>
              <span>${escapeHtml(calc.project?.name || "проект не выбран")}</span>
            </div>
            <div class="calculator-kpis">
              <article>
                <span>Операций</span>
                <strong>${calc.operationResults.length}</strong>
                <small>в маршрутной карте</small>
              </article>
              <article>
                <span>На мультипликацию</span>
                <strong>${formatSecondsDuration(calc.totalPerPanelSeconds)}</strong>
                <small>сумма операций без setup</small>
              </article>
              <article>
                <span>На заказ</span>
                <strong>${formatDuration(calc.totalMs)}</strong>
                <small>с setup ${formatDuration(calc.totalSetupMs)}</small>
              </article>
              <article>
                <span>Узкое место</span>
                <strong>${escapeHtml(calc.bottleneck?.operationName || "-")}</strong>
                <small>${formatSecondsDuration(calc.bottleneck?.perPanelSeconds || 0)} / мультипл.</small>
              </article>
            </div>
          </section>

          <section class="calculator-panel route-card-panel" data-calculator-block="route"${visibleAttr("route")}>
            <div class="directory-table-toolbar">
              <strong>04 · Маршрутная карта</strong>
              <span>${routeReady ? "операции, участки и расчет времени" : "сначала сформируйте маршрут по выбранным вводным"}</span>
            </div>
            <div class="directory-table-wrap" data-layout="table">
              <table class="directory-table calculator-table">
                <thead>
                  <tr>
                    <th>Шаг</th>
                    <th>Операция</th>
                    <th>Участок</th>
                    <th>Расчет</th>
                    <th>Ресурс</th>
                    <th>1 мультипл.</th>
                    <th>Заказ</th>
                  </tr>
                </thead>
                <tbody>
                  ${calc.operationResults.length ? calc.operationResults.map((row) => `
                    <tr class="route-operation-row ${row.id === selectedOperation?.id ? "is-selected" : ""}">
                      <td>${row.stepOrder}</td>
                      <td class="primary-cell route-operation-cell" data-select-route-operation="${row.id}" tabindex="0" role="button" aria-label="Редактировать операцию ${escapeAttribute(row.operationName)}">
                        <span class="component-name">${escapeHtml(row.operationName)}</span>
                        <small>${escapeHtml(row.bomList ? `${row.bomEntryQuantity}x ${row.bomList.resultItem || row.bomList.name} · ${row.operationBoardQuantity.toLocaleString("ru-RU")} плат` : row.comment || "операция маршрутной карты")}</small>
                      </td>
                      <td>${escapeHtml(row.workCenter?.name || row.workCenterId)}</td>
                      <td>${row.calculationType === "components" ? "Компоненты" : "Норматив"}</td>
                      <td>${escapeHtml(row.resource?.name || "-")}</td>
                      <td>${formatSecondsDuration(row.perPanelSeconds)}</td>
                      <td>${formatDuration(row.totalMs)}</td>
                    </tr>
                  `).join("") : `
                    <tr>
                      <td class="primary-cell" colspan="7">
                        <span class="component-name">${inputStatus.complete ? "Маршрут еще не сформирован" : "Входные данные не заполнены"}</span>
                        <small>${inputStatus.complete ? "Нажмите 'Сформировать маршрут', чтобы создать операции по шаблону проекта." : "Выберите проект, спецификацию, BOM и количества перед расчетом операций."}</small>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
            <div class="calculator-panel-actions route-actions">
              <button class="secondary-button" data-calculator-reset type="button" ${routeReady ? "" : "disabled"}>${icon("reset")}<span>Сбросить маршрут</span></button>
              <button class="secondary-button" data-add-route-operation type="button" ${inputStatus.complete ? "" : "disabled"}>${icon("plus")}<span>Добавить операцию</span></button>
              <button class="${routeReady ? "secondary-button" : "primary-button"}" data-calculator-build-route type="button" ${inputStatus.complete ? "" : "disabled"}>${icon("play")}<span>${routeReady ? "Пересобрать по шаблону" : "Сформировать маршрут"}</span></button>
              <button class="primary-button" data-calculator-save-route type="button" ${routeReady ? "" : "disabled"}>${icon("save")}<span>06 · Сохранить маршрут проекта</span></button>
            </div>
          </section>

          <section class="calculator-panel operation-editor-panel" data-calculator-block="operation"${visibleAttr("operation")}>
            <div class="report-card-head">
              <strong>05 · ${escapeHtml(selectedOperation?.operationName || "Операция")}</strong>
              <span>${selectedOperation ? "настройка выбранного шага" : "выберите или добавьте операцию"}</span>
            </div>
            ${selectedOperation ? `
            <div class="calculator-form-grid">
              <label class="field full">
                <span>Название операции</span>
                <input data-route-op-field="operationName" type="text" value="${escapeAttribute(selectedOperation?.operationName || "")}" />
              </label>
              <div class="field">
                <span>Участок</span>
                ${renderDenseInlineSelect("workCenterId", selectedOperation?.workCenterId || "", workCenterOptions, { type: "route" })}
              </div>
              <div class="field">
                <span>Метод расчета</span>
                ${renderDenseInlineSelect("calculationType", selectedOperation?.calculationType || "manual", calculationTypeOptions, { type: "route" })}
              </div>
              <div class="field full">
                <span>Ресурс</span>
                ${renderDenseInlineSelect("resourceId", selectedOperation?.resourceId || "", resourceOptions, { type: "route" })}
              </div>
              <label class="field">
                <span>Секунд на мультипликацию</span>
                <input data-route-op-number="secondsPerPanel" type="number" min="0" step="1" value="${Math.round(Number(selectedOperation?.secondsPerPanel || 0))}" ${isComponentOperation ? "disabled" : ""} />
              </label>
              <label class="field">
                <span>Setup, мин</span>
                <input data-route-op-number="setupMin" type="number" min="0" step="1" value="${Number(selectedOperation?.setupMin || 0)}" />
              </label>
              <label class="field full">
                <span>Комментарий технолога</span>
                <input data-route-op-field="comment" type="text" value="${escapeAttribute(selectedOperation?.comment || "")}" />
              </label>
            </div>
            <div class="calculator-panel-actions operation-actions">
              <button class="secondary-button danger" data-delete-route-operation type="button">${icon("trash")}<span>Удалить операцию</span></button>
            </div>
            ` : `
            <div class="calculator-empty-panel">
              ${icon(inputStatus.complete ? "info" : "lock")}
              <strong>${inputStatus.complete ? "Операция не выбрана" : "Маршрут пока недоступен"}</strong>
              <span>${inputStatus.complete ? "Сформируйте маршрут или добавьте операцию в блоке маршрутной карты." : "Заполните вводные данные, чтобы открыть редактирование удаленных аспектов маршрута."}</span>
            </div>
            `}
          </section>

          <section class="calculator-panel component-matrix-panel" data-calculator-block="bom"${visibleAttr("bom")}>
            <div class="directory-table-toolbar">
              <strong>02 · BOM SMT-операции</strong>
              <span>${escapeHtml(calc.bomList?.name || "BOM не выбран")}</span>
            </div>
            <div class="bom-overview">
              <article>
                <span>Плата</span>
                <strong>${escapeHtml(calc.bomList?.boardCode || "-")}</strong>
                <small>рев. ${escapeHtml(calc.bomList?.revision || "-")}</small>
              </article>
              <article>
                <span>Результат BOM</span>
                <strong>${escapeHtml(calc.bomList?.resultItem || "-")}</strong>
                <small>${bomActiveTypes} типов компонентов</small>
              </article>
              <article>
                <span>Компонентов / плата</span>
                <strong>${bomComponentsPerBoard.toLocaleString("ru-RU")}</strong>
                <small>${bomTotalPlacements.toLocaleString("ru-RU")} установок на заказ</small>
              </article>
              <article>
                <span>SMT / мультипликация</span>
                <strong>${formatSecondsDuration(bomOperationResult?.perPanelSeconds || 0)}</strong>
                <small>${escapeHtml(bomOperationResult?.resource?.name || "ресурс не выбран")}</small>
              </article>
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
                    <th>1 мультипл.</th>
                    <th>Заказ</th>
                  </tr>
                </thead>
                <tbody>
                  ${bomRows.length ? bomRows.map((row) => `
                    <tr>
                      <td class="primary-cell">
                        <span class="component-name">${escapeHtml(row.type.name)}</span>
                        <small>${escapeHtml(row.type.family || "")}</small>
                      </td>
                      <td>${escapeHtml(row.type.package || "-")}</td>
                      <td><span class="readonly-token">${row.count.toLocaleString("ru-RU")} шт.</span></td>
                      <td>${formatCalculatorNumber(row.coefficient)}</td>
                      <td>${formatCalculatorNumber(row.effectiveCph)} комп./ч</td>
                      <td>${formatSecondsDuration(row.secondsPerPanel)}</td>
                      <td>${row.totalPlacements.toLocaleString("ru-RU")}</td>
                    </tr>
                  `).join("") : `
                    <tr>
                      <td class="primary-cell" colspan="7">
                        <span class="component-name">${inputStatus.complete ? "BOM не содержит компонентных строк" : "BOM SMT еще не готов к расчету"}</span>
                        <small>${inputStatus.complete ? "Проверьте выбранный BOM-лист в справочнике." : "Выберите BOM и заполните количество плат/мультипликацию во входных данных."}</small>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </section>

          ${renderCalculatorSavePanel(calc, visibleAttr("save"))}
          ${renderCalculatorProjectBindings(calc, visibleAttr("bindings"))}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderCalculatorProjectBindings(calc, visibilityAttr = "") {
  const rows = planningState.projects.map((project) => {
    const specification = getProjectSpecification(project.id);
    const bomEntries = specification ? getSpecificationBomEntries(specification.id) : [];
    const route = planningState.routes.find((item) => item.projectId === project.id && item.isDefault)
      || planningState.routes.find((item) => item.projectId === project.id);
    const routeSteps = route ? planningState.routeSteps.filter((step) => step.routeId === route.id) : [];
    const batches = planningState.batches.filter((batch) => batch.projectId === project.id);
    const slots = planningState.slots.filter((slot) => slot.projectId === project.id);
    const isActive = project.id === calc.project?.id;
    const bomSummary = bomEntries.length
      ? `${bomEntries.length} BOM · ${bomEntries.map((entry) => `${entry.quantity}x ${entry.bom.name}`).join(", ")}`
      : "BOM не привязан";
    const specificationSummary = specification
      ? `${specification.name} · ${specification.outputItem}`
      : "спецификация не привязана";
    const routeSummary = routeSteps.length
      ? `${routeSteps.length} оп. · ${route?.name || "маршрут"}`
      : "маршрут не сохранен";
    const launchSummary = `${Number(project.totalQuantity || 0).toLocaleString("ru-RU")} плат · ${batches.length} парт. · ${slots.length} слотов`;
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
        <strong>07 · Текущие проекты</strong>
        <span>проект, спецификация, BOM, маршрут и запуск</span>
      </div>
      <div class="project-list-table" role="list">
        ${rows.map((row) => `
          <article class="project-list-row ${row.isActive ? "is-active" : ""}" role="listitem">
            <div class="project-list-main">
              <strong>${escapeHtml(row.project.name)}</strong>
              <small>${escapeHtml(row.project.orderNumber)} · ${escapeHtml(PROJECT_STATUS_LABELS[row.project.status] || row.project.status || "Статус")} · срок ${formatDate(row.project.dueDate)}</small>
            </div>
            <div class="project-list-meta">
              <span><b>СП</b>${escapeHtml(row.specificationSummary)}</span>
              <span><b>BOM</b>${escapeHtml(row.bomSummary)}</span>
              <span><b>Маршрут</b>${escapeHtml(row.routeSummary)}</span>
              <span><b>Запуск</b>${escapeHtml(row.launchSummary)}</span>
            </div>
            <button class="secondary-button" data-load-calculator-project="${row.project.id}" type="button">${icon("play")}<span>${row.isActive ? "Открыт" : "Открыть"}</span></button>
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
        <strong>06 · Передача в план</strong>
        <span>${savedReady ? `сохранено ${formatDateTime(calculatorState.lastSavedAt)}` : "сохраните маршрут проекта для Gantt"}</span>
      </div>
      <div class="calculator-kpis">
        <article>
          <span>Проект</span>
          <strong>${escapeHtml(calc.project?.name || "-")}</strong>
          <small>${escapeHtml(calc.project?.orderNumber || "проект не выбран")}</small>
        </article>
        <article>
          <span>Маршрут</span>
          <strong>${routeReady ? `${calc.operationResults.length} оп.` : "нет"}</strong>
          <small>${routeSteps.length ? `${routeSteps.length} шагов уже в проекте` : "будет создан при сохранении"}</small>
        </article>
        <article>
          <span>Расчет заказа</span>
          <strong>${formatDuration(calc.totalMs)}</strong>
          <small>${calc.panelCount.toLocaleString("ru-RU")} мультипликаций</small>
        </article>
        <article>
          <span>Gantt</span>
          <strong>${projectSlots.length}</strong>
          <small>слотов проекта в плане</small>
        </article>
      </div>
      <div class="calculator-save-summary">
        <div>
          ${icon(savedReady ? "check" : "info")}
          <span>${savedReady
            ? "Маршрутная карта сохранена в проект. Следующий шаг - постановка операций на диаграмму Ганта."
            : routeReady
              ? "Проверьте маршрут и сохраните его в проект, чтобы планирование использовало актуальные операции."
              : "Сначала сформируйте маршрутную карту на этапе 04."}</span>
        </div>
      </div>
      <div class="calculator-panel-actions">
        <button class="primary-button" data-calculator-save-route type="button" ${routeReady ? "" : "disabled"}>${icon("save")}<span>Сохранить маршрут проекта</span></button>
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
      title: "Проект",
      status: project ? "Готов" : "Нет проекта",
      complete: Boolean(project),
      meta: project ? `${project.orderNumber} · ${Number(project.totalQuantity || 0).toLocaleString("ru-RU")} шт.` : "выберите проект",
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
        <strong>00 · Готовность проекта</strong>
        <span>${escapeHtml(project?.name || "сквозной сценарий подготовки")}</span>
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
      ? [{ bom: calc.bomList, quantity: 1, slot: "PCB" }]
      : [];
  const rows = bomEntries.map((entry, index) => {
    const boards = Number(calc.boardQuantity || 0) * Number(entry.quantity || 0);
    const panels = calc.boardsPerPanel > 0 ? Math.ceil(boards / calc.boardsPerPanel) : 0;
    const operation = calc.operationResults.find((result) => result.bomListId === entry.bom.id)
      || getRouteOperations().find((item) => item.bomListId === entry.bom.id);
    return {
      index: index + 1,
      entry,
      boards,
      panels,
      operation,
    };
  });

  return `
    <section class="calculator-panel spec-bom-plan-panel" data-calculator-block="specBom"${visibilityAttr}>
      <div class="directory-table-toolbar">
        <strong>02 · ${calculatorState.noSpecification ? "BOM проекта" : "BOM из спецификации"}</strong>
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
  const rootAttribute = options.type === "routeStep"
    ? `data-dense-route-step-field="${escapeAttribute(name)}" data-route-step-id="${escapeAttribute(options.stepId || "")}"`
    : options.type === "routeModule"
      ? `data-dense-route-field="${escapeAttribute(name)}"`
      : options.type === "route"
        ? `data-dense-route-op-field="${escapeAttribute(name)}"`
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
    project: Boolean(calc.project),
    specification: calculatorState.noSpecification || Boolean(calc.specification),
    bom: Boolean(calc.bomList),
    boardQuantity: Number.isFinite(boardQuantity) && boardQuantity > 0,
    boardsPerPanel: Number.isFinite(boardsPerPanel) && boardsPerPanel > 0,
  };
  status.complete = Object.values(status).every(Boolean);
  return status;
}

function isCalculatorInputsComplete() {
  return getCalculatorInputStatus(calculateComplexityResult()).complete;
}

function getCalculatorWorkflow(calc) {
  const inputStatus = getCalculatorInputStatus(calc);
  const bomCounts = calc.bomList ? Object.values(getBomComponentCounts(calc.bomList)) : [];
  const bomRows = calc.operationResults.find((operation) => operation.calculationType === "components")?.componentRows || [];
  const routeReady = calc.operationResults.length > 0;
  const selectedReady = Boolean(calc.selectedOperation?.id);
  const savedReady = Boolean(calculatorState.lastSavedAt) && routeReady;
  const steps = [
    {
      id: "inputs",
      sequence: "01",
      title: "Входные данные",
      caption: calculatorState.noSpecification ? "проект, BOM и размер запуска" : "проект, спецификация, BOM и размер запуска",
      complete: inputStatus.complete,
      locked: false,
    },
    {
      id: "bom",
      sequence: "02",
      title: "BOM SMT",
      caption: inputStatus.bom ? "компоненты подтянуты из привязки проекта" : "выберите BOM для SMT-операции",
      complete: inputStatus.complete && (bomRows.some((row) => row.count > 0) || bomCounts.some((count) => count > 0)),
      locked: !inputStatus.complete,
    },
    {
      id: "summary",
      sequence: "03",
      title: "Сводка",
      caption: routeReady ? "длительность и узкое место рассчитаны" : "появится после маршрута",
      complete: routeReady,
      locked: !inputStatus.complete,
    },
    {
      id: "route",
      sequence: "04",
      title: "Маршрутная карта",
      caption: routeReady ? `${calc.operationResults.length} операций в маршруте` : "сформируйте маршрут по шаблону проекта",
      complete: routeReady,
      locked: !inputStatus.complete,
    },
    {
      id: "operation",
      sequence: "05",
      title: "Операция",
      caption: selectedReady ? "клик по строке открывает редактирование" : "выберите операцию в маршрутной карте",
      complete: selectedReady,
      locked: !routeReady,
    },
    {
      id: "save",
      sequence: "06",
      title: "Передача в план",
      caption: savedReady ? `сохранено ${formatDateTime(calculatorState.lastSavedAt)}` : "сохраните маршрут проекта для Gantt",
      complete: savedReady,
      locked: !routeReady,
      warning: routeReady && !savedReady,
    },
    {
      id: "bindings",
      sequence: "07",
      title: "Текущие проекты",
      caption: calc.project ? "проектные связи и быстрый выбор" : "список проектов, спецификаций и BOM",
      complete: planningState.projects.length > 0,
      locked: false,
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
  const steps = getCalculatorWorkflow(calc);
  return `
    <div class="calculator-process-head">
      <span class="eyebrow">Навигация и готовность</span>
      <h3>Калькулятор проекта</h3>
      <p>Выберите этап слева: справа откроются только связанные блоки. Статус показывает заполненность перед передачей в Gantt.</p>
    </div>
    <ol class="calculator-process-stepper calculator-step-nav">
      ${steps.map((step, index) => `
        <li class="${step.complete ? "is-done" : ""} ${step.id === ui.calculatorStep ? "is-active" : ""} ${step.locked ? "is-locked" : ""} ${step.warning ? "is-warning" : ""}">
          <button class="stepper-status-card" data-calculator-step="${escapeAttribute(step.id)}" type="button" aria-current="${step.id === ui.calculatorStep ? "step" : "false"}">
            <span class="stepper-status-index">${escapeHtml(step.sequence || String(index + 1).padStart(2, "0"))}</span>
            <div>
              <strong>${escapeHtml(step.title)}</strong>
              <small>${escapeHtml(step.caption)}</small>
            </div>
            <em>${step.complete ? "готово" : step.locked ? "закрыто" : step.warning ? "проверить" : "текущий"}</em>
          </button>
        </li>
      `).join("")}
    </ol>
  `;
}

function calculateComplexityResult() {
  const project = getCalculatorProject();
  const specification = (directoryState.specifications || []).find((item) => item.id === calculatorState.specificationId)
    || null;
  const bomList = getBomList(calculatorState.bomListId);
  const boardQuantity = Number(calculatorState.boardQuantity || 0);
  const boardsPerPanel = Number(calculatorState.boardsPerPanel || 0);
  const specificationReady = Boolean(specification) || calculatorState.noSpecification;
  const hasInputSet = project && specificationReady && bomList && boardQuantity > 0 && boardsPerPanel > 0;
  const panelCount = hasInputSet ? Math.ceil(boardQuantity / boardsPerPanel) : 0;
  const operationResults = hasInputSet
    ? getRouteOperations().map((operation) => calculateRouteOperation(operation, { boardQuantity, boardsPerPanel, panelCount }))
    : [];
  const selectedOperation = operationResults.find((operation) => operation.id === calculatorState.selectedOperationId)
    || operationResults[0];
  const selectedResult = selectedOperation || createEmptyOperationResult();
  const totalPerPanelSeconds = operationResults.reduce((sum, operation) => sum + operation.perPanelSeconds, 0);
  const totalSetupMs = operationResults.reduce((sum, operation) => sum + operation.setupMs, 0);
  const totalMs = operationResults.reduce((sum, operation) => sum + operation.totalMs, 0);
  const bottleneck = [...operationResults].sort((left, right) => right.perPanelSeconds - left.perPanelSeconds)[0];

  return {
    project,
    specification,
    bomList,
    bomEntries: specification
      ? getSpecificationBomEntries(specification.id)
      : calculatorState.noSpecification && bomList
        ? [{ bom: bomList, quantity: 1, slot: "PCB" }]
        : [],
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
  const resource = getResourcesForWorkCenter("smt")[0] || directoryState.resources[0];
  const resourceBaseCph = getResourceBaseCph(resource);
  const efficiency = Math.max(0.1, Number(resource?.efficiency || 100) / 100);
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
  const resource = resources.find((item) => item.id === operation.resourceId) || resources[0] || directoryState.resources[0];
  const setupMs = Math.max(0, Number(operation.setupMin || resource?.changeoverMin || 0) * 60 * 1000);
  const quantityMultiplier = Math.max(1, Number(operation.quantityMultiplier || 1));
  const operationBoardQuantity = operation.calculationType === "components"
    ? context.boardQuantity * quantityMultiplier
    : context.boardQuantity;
  const operationPanelCount = operation.calculationType === "components"
    ? Math.max(1, Math.ceil(operationBoardQuantity / Math.max(1, context.boardsPerPanel)))
    : context.panelCount;
  const operationBomList = getBomList(operation.bomListId);

  if (operation.calculationType === "components") {
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
        secondsPerPanel: secondsPerBoard * context.boardsPerPanel,
        totalPlacements: count * operationBoardQuantity,
        complexity: count * coefficient,
      };
    });
    const perBoardSeconds = componentRows.reduce((sum, row) => sum + row.secondsPerBoard, 0);
    const perPanelSeconds = perBoardSeconds * context.boardsPerPanel;
    const totalMs = perPanelSeconds * operationPanelCount * 1000 + setupMs;
    return {
      ...operation,
      workCenter,
      resource,
      bomList: operationBomList,
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

  const fallbackSeconds = getDefaultSecondsPerPanel(operation.workCenterId, context.boardsPerPanel);
  const perPanelSeconds = Math.max(0, Number(operation.secondsPerPanel || fallbackSeconds));
  const perBoardSeconds = perPanelSeconds / Math.max(1, context.boardsPerPanel);
  const totalMs = perPanelSeconds * operationPanelCount * 1000 + setupMs;
  return {
    ...operation,
    workCenter,
    resource,
    bomList: operationBomList,
    bomEntryQuantity: quantityMultiplier,
    operationBoardQuantity,
    operationPanelCount,
    componentRows: [],
    perBoardSeconds,
    perPanelSeconds,
    setupMs,
    totalMs,
    flowBoardsPerHour: perBoardSeconds > 0 ? 3600 / perBoardSeconds : 0,
    flowPanelsPerHour: perPanelSeconds > 0 ? 3600 / perPanelSeconds : 0,
    activeComponentCount: 0,
    complexityScore: 0,
  };
}

function getCalculatorProject() {
  return planningState.projects.find((project) => project.id === calculatorState.projectId) || null;
}

function getCalculatorWorkCenter() {
  const selectedOperation = getRouteOperations().find((operation) => operation.id === calculatorState.selectedOperationId);
  return planningState.workCenters.find((center) => center.id === selectedOperation?.workCenterId)
    || planningState.workCenters.find((center) => center.id === "smt")
    || planningState.workCenters[0];
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
  const calculationType = operation.calculationType || (workCenterId === "smt" ? "components" : "manual");
  return {
    id: operation.id || makeId("op"),
    stepOrder: Math.max(1, Number(operation.stepOrder || stepOrder)),
    operationName: operation.operationName || getWorkCenter(workCenterId)?.name || "Операция",
    workCenterId,
    resourceId: resource?.id || operation.resourceId || "",
    calculationType,
    secondsPerPanel: Math.max(0, Number(operation.secondsPerPanel || getDefaultSecondsPerPanel(workCenterId, boardsPerPanel))),
    setupMin: Math.max(0, Number(operation.setupMin || resource?.changeoverMin || 0)),
    comment: operation.comment || "",
    bomListId: operation.bomListId || "",
    bomSlot: operation.bomSlot || "",
    quantityMultiplier: Math.max(1, Number(operation.quantityMultiplier || 1)),
    sourceRouteStepId: operation.sourceRouteStepId || "",
  };
}

function createDefaultRouteOperations(projectId, boardsPerPanel = defaultCalculatorState.boardsPerPanel) {
  const steps = getProjectRouteSteps(projectId || planningState.projects[0]?.id, planningState);
  const specification = (directoryState.specifications || []).find((item) => item.id === calculatorState.specificationId)
    || getProjectSpecification(projectId);
  const selectedBom = getBomList(calculatorState.bomListId);
  const bomEntries = calculatorState.noSpecification && selectedBom
    ? [{ bom: selectedBom, quantity: 1, slot: "PCB" }]
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
    const entries = isExpandableSmt ? bomEntries : [{ bom: getBomList(step.bomListId), quantity: step.quantityMultiplier || 1, slot: step.bomSlot || "" }];

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
        calculationType: step.workCenterId === "smt" ? "components" : "manual",
        secondsPerPanel: getDefaultSecondsPerPanel(step.workCenterId, boardsPerPanel),
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
  return (directoryState.componentTypes || []).filter((type) => type.status !== "Отключен");
}

function getProjectSpecification(projectId) {
  if (!projectId) return null;
  return (directoryState.specifications || []).find((specification) => specification.projectId === projectId) || null;
}

function getSpecificationBomEntries(specificationId) {
  const specification = (directoryState.specifications || []).find((item) => item.id === specificationId);
  if (!specification) return [];
  return [
    { bom: getBomList(specification.bomListA), quantity: Math.max(0, Number(specification.bomQtyA || 0)), slot: "A" },
    { bom: getBomList(specification.bomListB), quantity: Math.max(0, Number(specification.bomQtyB || 0)), slot: "B" },
  ].filter((entry) => entry.bom && entry.quantity > 0);
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
  if (!specification) return "Свяжите спецификацию с проектом в справочнике.";
  const bomText = getSpecificationBomEntries(specification.id)
    .map((entry) => `${entry.quantity}x ${entry.bom.resultItem || entry.bom.name}`)
    .join(" + ");
  const extras = specification.extraItems ? ` + ${specification.extraItems}` : "";
  return `${bomText || "BOM не выбран"}${extras}`;
}

function buildNoSpecificationSummary(calc) {
  if (!calc.project) return "Выберите проект, затем BOM печатной платы.";
  if (!calc.bomList) return "Для проекта без спецификации нужно выбрать BOM-лист печатной платы.";
  return `${calc.project.name}: результат проекта считается как ${calc.bomList.resultItem || calc.bomList.name}.`;
}

function getBomList(bomId) {
  return (directoryState.bomLists || []).find((bom) => bom.id === bomId) || null;
}

function getBomComponentCounts(bom) {
  if (!bom) return getDefaultComponentCounts();
  return Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [
    field.componentId,
    Math.max(0, Math.round(Number(bom[field.key] || 0))),
  ]));
}

function normalizeBomImportRow(row) {
  const source = Array.isArray(row?.values) ? row.values : Array.isArray(row) ? row : [];
  const values = Array.from({ length: BOM_IMPORT_COLUMN_COUNT }, (_, index) => source[index] ?? row?.[index] ?? "");
  return {
    sequence: values[0] ?? "",
    description: values[1] ?? "",
    designator: values[2] ?? "",
    manufacturerPart: values[3] ?? "",
    manufacturer: values[4] ?? "",
    package: values[5] ?? "",
    quantity: Math.max(0, Number(values[6] || 0)),
    note: values[7] ?? "",
    extra: values[8] ?? "",
    values,
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

  if (packageText === "0402" || packageText === "402") return "c0402";
  if (packageText === "0603" || packageText === "603") return "c0603";
  if (packageText === "0805" || packageText === "805") return "c0805";
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

function normalizePackageText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, "")
    .replace(/^0?(\d{3})$/, "0$1");
}

function summarizeBomComponentFields(importRows) {
  const totals = Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, 0]));
  for (const row of importRows) {
    const key = classifyBomPackage(row);
    totals[key] = (totals[key] || 0) + Math.max(0, Number(row.quantity || 0));
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value)]));
}

async function importBomFromXlsxFile(file, projectId) {
  const parsed = await parseXlsxBomFile(file);
  const name = getFileBaseName(file.name);
  const id = makeId("bom");
  const importRows = parsed.rows.map((row) => normalizeBomImportRow(row));
  const componentTotals = summarizeBomComponentFields(importRows);
  const stamp = new Date().toISOString();
  const row = normalizeDirectoryRow("bomLists", {
    id,
    name,
    projectId,
    boardCode: name,
    revision: "import",
    resultItem: `Смонтированная печатная плата ${name}`,
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
  directoryState = normalizeDirectoryState(directoryState);
  ui.activeBomId = id;
  ui.activeProjectId = projectId;
  persistDirectoryState();
  persistUiState();
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
  const fallback = createDefaultDirectoryState();
  const source = directoryState?.componentTypes?.length ? directoryState.componentTypes : fallback.componentTypes;
  return Object.fromEntries(source.map((type) => [type.id, Math.max(0, Math.round(Number(type.defaultCount || 0)))]));
}

function getResourcesForWorkCenter(workCenterId) {
  const center = planningState?.workCenters?.find((item) => item.id === workCenterId);
  const centerNames = new Set([center?.id, center?.name, center?.code].filter(Boolean).map(normalizeLookupText));
  const matched = (directoryState?.resources || []).filter((resource) => centerNames.has(normalizeLookupText(resource.workCenter)));
  if (matched.length) return matched;
  if (!center) return [];
  return [{
    id: `resource-${center.id}-norm`,
    name: `${center.name} · норматив`,
    type: "Норматив участка",
    workCenter: center.name,
    capacity: `${Number(center.unitsPerHour || getWorkCenterUnitsPerHour(center.id)).toLocaleString("ru-RU")} изд./час`,
    baseCph: center.id === "smt" ? DEFAULT_RESOURCE_CPH : 0,
    efficiency: 100,
    changeoverMin: 0,
    status: "Норматив",
  }];
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
  return planningState.projects.find((project) => project.id === ui.activeProjectId)
    || planningState.projects[0]
    || null;
}

function getActiveSpecificationForModule() {
  if (ui.activeSpecificationId === "__new__") return null;
  return (directoryState.specifications || []).find((specification) => specification.id === ui.activeSpecificationId)
    || (directoryState.specifications || [])[0]
    || null;
}

function getActiveBomForModule(activeSpecification = null) {
  if (ui.activeBomId === "__new__") return null;
  const specBom = activeSpecification ? getBomList(activeSpecification.bomListA) : null;
  return (directoryState.bomLists || []).find((bom) => bom.id === ui.activeBomId)
    || specBom
    || (directoryState.bomLists || [])[0]
    || null;
}

function getBomLinkedSpecifications(bomId) {
  if (!bomId) return [];
  return (directoryState.specifications || []).filter((specification) => (
    specification.bomListA === bomId || specification.bomListB === bomId
  ));
}

function getProjectModuleContext(project) {
  if (!project) {
    return {
      specification: null,
      boms: [],
      routeSteps: [],
      batches: [],
      slots: [],
      warnings: [],
      progress: 0,
      plannedHours: 0,
      warehouseQuantity: 0,
    };
  }

  const specification = getProjectSpecification(project.id);
  const boms = (directoryState.bomLists || []).filter((bom) => bom.projectId === project.id);
  const routeSteps = getProjectRouteSteps(project.id, planningState);
  const batches = planningState.batches.filter((batch) => batch.projectId === project.id);
  const slots = planningState.slots.filter((slot) => slot.projectId === project.id);
  const warnings = getSlotWarnings(planningState).warnings.filter((warning) => warning.projectId === project.id);
  return {
    specification,
    boms,
    routeSteps,
    batches,
    slots,
    warnings,
    progress: calculateProjectProgress(project, planningState),
    plannedHours: Math.round(slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0) * 10) / 10,
    warehouseQuantity: slots.filter((slot) => slot.workCenterId === "warehouse").reduce((sum, slot) => sum + Number(slot.quantity || 0), 0),
  };
}

function renderProjectsPage() {
  const selectedProject = getActiveProjectForModule();
  const isNewProject = ui.activeProjectId === "__new__" || !selectedProject;
  const project = selectedProject || {
    id: "",
    name: "",
    orderNumber: "",
    customer: "",
    totalQuantity: "",
    dueDate: toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
    status: "planned",
  };
  const context = getProjectModuleContext(selectedProject);

  return `
    <section class="projects-page module-data-page" data-layout="main-content" aria-label="Проекты MES">
      <aside class="directory-sidebar module-data-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Заказы и связки</span>
          <h1>Проекты</h1>
        </div>
        <div class="module-sidebar-actions">
          <button class="primary-button" data-project-create type="button">${icon("plus")}<span>Новый проект</span></button>
        </div>
        <div class="module-entity-list">
          ${isNewProject ? `
            <button class="module-entity-item is-active" type="button">
              <span><strong>Новый проект</strong><small>заполните карточку справа</small></span>
              <em>new</em>
            </button>
          ` : ""}
          ${planningState.projects.map((item) => {
            const itemContext = getProjectModuleContext(item);
            return `
              <button class="module-entity-item ${item.id === selectedProject?.id ? "is-active" : ""}" data-project-open="${item.id}" type="button">
                <span>
                  <strong>${escapeHtml(item.name)}</strong>
                  <small>${escapeHtml(item.orderNumber)} · ${escapeHtml(item.customer || "заказчик не задан")}</small>
                </span>
                <em>${itemContext.progress}%</em>
              </button>
            `;
          }).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Проект</span>
            <h2>${escapeHtml(isNewProject ? "Новый проект" : project.name)}</h2>
            <p>${escapeHtml(isNewProject ? "Создайте заказ, чтобы связать его со спецификацией, BOM и маршрутной картой." : `${project.orderNumber} · ${project.customer || "заказчик не задан"} · срок ${formatDate(project.dueDate)}`)}</p>
          </div>
          <div class="directory-actions">
            <button class="secondary-button" data-project-to-calculator type="button" ${selectedProject ? "" : "disabled"}>${icon("calculator")}<span>В калькулятор</span></button>
            <button class="primary-button" data-project-to-planning type="button" ${selectedProject ? "" : "disabled"}>${icon("calendar")}<span>В план</span></button>
          </div>
        </header>

        <div class="module-data-content project-module-content">
          <section class="module-panel project-editor-panel">
            <div class="report-card-head">
              <strong>01 · Карточка проекта</strong>
              <span>${isNewProject ? "создание нового заказа" : "редактирование параметров заказа"}</span>
            </div>
            <form id="projectModuleForm" class="module-form">
              <input type="hidden" name="projectId" value="${escapeAttribute(project.id)}" />
              <input type="hidden" name="isNew" value="${isNewProject ? "yes" : "no"}" />
              <input type="hidden" name="status" data-project-status-input value="${escapeAttribute(project.status || "planned")}" />
              <label class="form-field full"><span>Название проекта</span><input name="name" value="${escapeAttribute(project.name)}" placeholder="Например: Контроллер питания V3" /></label>
              <label class="form-field"><span>Номер заказа</span><input name="orderNumber" value="${escapeAttribute(project.orderNumber)}" placeholder="№0000" /></label>
              <label class="form-field"><span>Заказчик</span><input name="customer" value="${escapeAttribute(project.customer)}" placeholder="Компания" /></label>
              <label class="form-field"><span>Количество изделий</span><input name="totalQuantity" type="number" min="1" step="1" value="${escapeAttribute(project.totalQuantity)}" /></label>
              <label class="form-field"><span>Срок сдачи</span><input name="dueDate" type="date" value="${escapeAttribute(project.dueDate)}" /></label>
              <label class="form-field ${isNewProject ? "" : "readonly"}">
                <span>Шаблон маршрута</span>
                <select name="routeTemplate" ${isNewProject ? "" : "disabled"}>
                  ${routeTemplateOptions.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join("")}
                </select>
              </label>
              <div class="module-status-field full">
                <span>Статус проекта</span>
                <div class="module-status-segments" data-project-status-group>
                  ${PROJECT_STATUSES.map((status) => `
                    <button class="${status === project.status ? "is-active" : ""}" data-project-status-option="${status}" type="button">${escapeHtml(PROJECT_STATUS_LABELS[status] || status)}</button>
                  `).join("")}
                </div>
              </div>
              <div class="module-form-actions full">
                <button class="primary-button" type="submit">${icon("save")}<span>${isNewProject ? "Создать проект" : "Сохранить проект"}</span></button>
              </div>
            </form>
          </section>

          <section class="module-panel project-relations-panel">
            <div class="report-card-head">
              <strong>02 · Связи проекта</strong>
              <span>спецификация, BOM, партии и маршрут</span>
            </div>
            <div class="module-kpi-grid">
              <article><span>Готовность</span><strong>${context.progress}%</strong><small>по закрытым обязательным операциям</small></article>
              <article><span>Плановые часы</span><strong>${formatReportNumber(context.plannedHours)}</strong><small>${context.slots.length} операций в Gantt</small></article>
              <article><span>Склад</span><strong>${context.warehouseQuantity.toLocaleString("ru-RU")}</strong><small>финальный выпуск</small></article>
              <article><span>Риски</span><strong>${context.warnings.length}</strong><small>предупреждений по проекту</small></article>
            </div>
            <div class="project-relation-grid">
              <article>
                <span>Спецификация</span>
                <strong>${escapeHtml(context.specification?.name || "Не привязана")}</strong>
                <small>${escapeHtml(context.specification ? `${context.specification.outputItem} · рев. ${context.specification.revision}` : "создайте в модуле Спецификации")}</small>
                <button class="secondary-button" data-open-project-specification type="button" ${selectedProject ? "" : "disabled"}>${icon("book")}<span>Открыть</span></button>
              </article>
              <article>
                <span>BOM-листы</span>
                <strong>${context.boms.length}</strong>
                <small>${escapeHtml(context.boms.map((bom) => bom.name).join(" · ") || "нет BOM для проекта")}</small>
                <button class="secondary-button" data-open-project-boms type="button" ${selectedProject ? "" : "disabled"}>${icon("book")}<span>Открыть BOM</span></button>
              </article>
              <article>
                <span>Маршрут</span>
                <strong>${context.routeSteps.length} операций</strong>
                <small>${escapeHtml(context.routeSteps.map((step) => step.operationName).join(" → ") || "маршрут не сформирован")}</small>
                <button class="secondary-button" data-open-project-route type="button" ${selectedProject ? "" : "disabled"}>${icon("split")}<span>Открыть маршрут</span></button>
              </article>
              <article>
                <span>Партии</span>
                <strong>${context.batches.length}</strong>
                <small>${escapeHtml(context.batches.map((batch) => `${batch.batchNumber}: ${Number(batch.quantity || 0).toLocaleString("ru-RU")}`).join(" · ") || "партии не созданы")}</small>
                <button class="secondary-button" data-project-to-planning type="button" ${selectedProject ? "" : "disabled"}>${icon("calendar")}<span>Гант</span></button>
              </article>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderSpecificationsPage() {
  const activeSpecification = getActiveSpecificationForModule();
  const isNewSpecification = ui.activeSpecificationId === "__new__" || !activeSpecification;
  const defaultProjectId = activeSpecification?.projectId || getActiveProjectForModule()?.id || planningState.projects[0]?.id || "";
  const specification = activeSpecification || {
    id: "",
    name: "",
    projectId: defaultProjectId,
    revision: "A",
    outputItem: "",
    bomListA: "",
    bomQtyA: 1,
    bomListB: "",
    bomQtyB: 0,
    extraItems: "",
    status: "Черновик",
  };
  const bomEntries = getSpecificationBomEntries(activeSpecification?.id);
  const activeProject = getProject(specification.projectId);
  const projectBoms = (directoryState.bomLists || []).filter((item) => item.projectId === specification.projectId);
  const specificationBomOptions = [
    ...projectBoms,
    ...[getBomList(specification.bomListA), getBomList(specification.bomListB)]
      .filter(Boolean)
      .filter((bom) => !projectBoms.some((item) => item.id === bom.id)),
  ];

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
              <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(getProject(item.projectId)?.name || "без проекта")} · рев. ${escapeHtml(item.revision || "-")}</small></span>
              <em>${escapeHtml(item.status || "-")}</em>
            </button>
          `).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Конструктор состава</span>
            <h2>${escapeHtml(isNewSpecification ? "Новая спецификация изделия" : specification.name)}</h2>
            <p>${escapeHtml(activeProject ? `${activeProject.name}: BOM отвечает за смонтированную плату, спецификация за полный состав проекта.` : "Выберите проект и соберите структуру изделия.")}</p>
          </div>
          <div class="directory-actions">
            <button class="secondary-button" data-open-spec-boms type="button">${icon("book")}<span>BOM-листы</span></button>
            <button class="secondary-button" data-specification-to-calculator type="button" ${activeSpecification ? "" : "disabled"}>${icon("calculator")}<span>В калькулятор</span></button>
          </div>
        </header>

        <div class="module-data-content specification-module-content">
          <section class="module-panel specification-editor-panel">
            <div class="report-card-head">
              <strong>01 · Спецификация изделия</strong>
              <span>${isNewSpecification ? "создание структуры проекта" : "из чего собрать проект"}</span>
            </div>
            <form id="specificationModuleForm" class="module-form">
              <input type="hidden" name="specificationId" value="${escapeAttribute(specification.id)}" />
              <input type="hidden" name="isNew" value="${isNewSpecification ? "yes" : "no"}" />
              <label class="form-field"><span>Проект</span><select name="projectId">${planningState.projects.map((project) => `<option value="${project.id}" ${selected(specification.projectId, project.id)}>${escapeHtml(project.name)}</option>`).join("")}</select></label>
              <label class="form-field"><span>Название</span><input name="name" value="${escapeAttribute(specification.name)}" placeholder="СП изделия" /></label>
              <label class="form-field"><span>Ревизия</span><input name="revision" value="${escapeAttribute(specification.revision)}" /></label>
              <label class="form-field full"><span>Итоговое изделие</span><input name="outputItem" value="${escapeAttribute(specification.outputItem)}" placeholder="Готовое изделие / узел" /></label>
              <label class="form-field"><span>BOM A</span><select name="bomListA"><option value="">Не выбран</option>${specificationBomOptions.map((item) => `<option value="${item.id}" ${selected(specification.bomListA, item.id)}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
              <label class="form-field"><span>Кол-во A</span><input name="bomQtyA" type="number" min="0" step="1" value="${Number(specification.bomQtyA || 0)}" /></label>
              <label class="form-field"><span>BOM B</span><select name="bomListB"><option value="">Не выбран</option>${specificationBomOptions.map((item) => `<option value="${item.id}" ${selected(specification.bomListB, item.id)}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
              <label class="form-field"><span>Кол-во B</span><input name="bomQtyB" type="number" min="0" step="1" value="${Number(specification.bomQtyB || 0)}" /></label>
              <label class="form-field full"><span>Дополнительный состав</span><input name="extraItems" value="${escapeAttribute(specification.extraItems)}" placeholder="Корпус; кабель; крепеж; маркировка" /></label>
              <label class="form-field"><span>Статус</span><input name="status" value="${escapeAttribute(specification.status)}" /></label>
              <div class="module-form-actions full">
                <button class="primary-button" type="submit">${icon("save")}<span>${isNewSpecification ? "Создать спецификацию" : "Сохранить спецификацию"}</span></button>
              </div>
            </form>
          </section>

          <section class="module-panel spec-structure-panel">
            <div class="report-card-head">
              <strong>02 · Визуальная структура</strong>
              <span>проект → спецификация → BOM → компоненты</span>
            </div>
            <div class="spec-module-tree">
              <article class="is-project"><strong>${escapeHtml(activeProject?.name || "Проект не выбран")}</strong><small>${escapeHtml(activeProject?.orderNumber || "сначала привяжите проект")}</small></article>
              <article class="is-output"><strong>${escapeHtml(specification.outputItem || "Итоговое изделие не задано")}</strong><small>${escapeHtml(specification.extraItems || "дополнительный состав не задан")}</small></article>
              ${bomEntries.length ? bomEntries.map((entry) => `
                <article class="is-bom">
                  <strong>${escapeHtml(entry.bom.name)}</strong>
                  <small>${entry.quantity}x · ${escapeHtml(entry.bom.resultItem || entry.bom.boardCode || "")}</small>
                </article>
              `).join("") : `
                <article class="is-warning"><strong>BOM не привязан</strong><small>добавьте хотя бы один BOM-лист для SMT-операции</small></article>
              `}
            </div>
          </section>

        </div>
      </div>
    </section>
  `;
}

function renderBomListsPage() {
  const activeBom = getActiveBomForModule();
  const isNewBom = ui.activeBomId === "__new__" || !activeBom;
  const defaultProjectId = activeBom?.projectId || getActiveProjectForModule()?.id || planningState.projects[0]?.id || "";
  const bom = activeBom || {
    id: "",
    name: "",
    projectId: defaultProjectId,
    boardCode: "",
    revision: "A.0",
    resultItem: "",
    status: "Черновик",
    ...Object.fromEntries(BOM_COMPONENT_FIELDS.map((field) => [field.key, 0])),
  };
  const activeProject = getProject(bom.projectId);
  const componentCounts = getBomComponentCounts(bom);
  const componentTotal = Object.values(componentCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  const linkedSpecifications = getBomLinkedSpecifications(bom.id);
  const importRows = getBomImportRows(bom);
  const importHeaders = getBomImportHeaders(bom);

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
            const total = Object.values(getBomComponentCounts(item)).reduce((sum, count) => sum + Number(count || 0), 0);
            return `
              <button class="module-entity-item ${item.id === activeBom?.id ? "is-active" : ""}" data-bom-open="${item.id}" type="button">
                <span>
                  <strong>${escapeHtml(item.name)}</strong>
                  <small>${escapeHtml(getProject(item.projectId)?.name || "без проекта")} · ${escapeHtml(item.boardCode || "-")}</small>
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
            <h2>${escapeHtml(isNewBom ? "Новый BOM-лист" : bom.name)}</h2>
            <p>${escapeHtml(activeProject ? `${activeProject.name}: BOM описывает смонтированную печатную плату и используется калькулятором SMT.` : "Выберите проект и заполните компонентный состав платы.")}</p>
          </div>
          <div class="directory-actions">
            <button class="secondary-button" data-bom-to-specifications type="button" ${activeBom ? "" : "disabled"}>${icon("book")}<span>Спецификации</span></button>
            <button class="secondary-button" data-bom-to-calculator type="button" ${activeBom ? "" : "disabled"}>${icon("calculator")}<span>В калькулятор</span></button>
          </div>
        </header>

        <div class="module-data-content bom-module-content">
          <section class="module-panel bom-editor-panel">
            <div class="report-card-head">
              <strong>01 · Карточка BOM</strong>
              <span>${isNewBom ? "создание компонентного состава" : "покомпонентный расчет платы"}</span>
            </div>
            <form id="bomModuleForm" class="module-form">
              <input type="hidden" name="bomId" value="${escapeAttribute(bom.id)}" />
              <input type="hidden" name="isNew" value="${isNewBom ? "yes" : "no"}" />
              <label class="form-field"><span>Проект</span><select name="projectId">${planningState.projects.map((project) => `<option value="${project.id}" ${selected(bom.projectId, project.id)}>${escapeHtml(project.name)}</option>`).join("")}</select></label>
              <label class="form-field"><span>Название BOM</span><input name="name" value="${escapeAttribute(bom.name)}" placeholder="BOM PCB" /></label>
              <label class="form-field"><span>Код платы</span><input name="boardCode" value="${escapeAttribute(bom.boardCode)}" placeholder="PCB-..." /></label>
              <label class="form-field"><span>Ревизия</span><input name="revision" value="${escapeAttribute(bom.revision)}" /></label>
              <label class="form-field full"><span>Результат BOM</span><input name="resultItem" value="${escapeAttribute(bom.resultItem)}" placeholder="Смонтированная печатная плата" /></label>
              <label class="form-field"><span>Статус</span><input name="status" value="${escapeAttribute(bom.status)}" /></label>
              <div class="bom-component-grid full">
                ${BOM_COMPONENT_FIELDS.map((field) => `
                  <label><span>${escapeHtml(field.label)}</span><input name="${field.key}" type="number" min="0" step="1" value="${Number(bom[field.key] || 0)}" /></label>
                `).join("")}
              </div>
              <div class="module-form-actions full">
                <button class="primary-button" type="submit">${icon("save")}<span>${isNewBom ? "Создать BOM" : "Сохранить BOM"}</span></button>
              </div>
            </form>
          </section>

          <section class="module-panel bom-summary-panel">
            <div class="report-card-head">
              <strong>02 · Связи и импорт</strong>
              <span>проект, спецификации и Excel-шаблон</span>
            </div>
            <div class="module-kpi-grid bom-kpi-grid">
              <article><span>Компонентов</span><strong>${componentTotal.toLocaleString("ru-RU")}</strong><small>на одну плату</small></article>
              <article><span>Типов</span><strong>${Object.values(componentCounts).filter((count) => Number(count || 0) > 0).length}</strong><small>заполненных категорий</small></article>
              <article><span>Спецификаций</span><strong>${linkedSpecifications.length}</strong><small>используют этот BOM</small></article>
              <article><span>Импорт</span><strong>${importRows.length || "Excel"}</strong><small>${importRows.length ? "строк из файла" : "готов к загрузке"}</small></article>
            </div>
            <div class="bom-link-list">
              <div class="bom-import-note">
                <strong>Импорт BOM из Excel</strong>
                <span>Загрузите XLSX: название файла станет названием BOM, строки читаются от A до I, импорт остановится на первой пустой ячейке A.</span>
                <div class="bom-import-controls">
                  <label class="form-field">
                    <span>Проект для BOM</span>
                    <select id="bomImportProjectId">${planningState.projects.map((project) => `<option value="${project.id}" ${selected(defaultProjectId, project.id)}>${escapeHtml(project.name)}</option>`).join("")}</select>
                  </label>
                  <label class="secondary-button bom-file-import-button">
                    ${icon("upload")}
                    <span>Импортировать Excel</span>
                    <input data-bom-import-file type="file" accept=".xlsx,.xls" />
                  </label>
                </div>
              </div>
              <div class="module-list-label">Где используется</div>
              ${linkedSpecifications.length ? linkedSpecifications.map((specification) => `
                <button class="module-entity-item" data-bom-linked-spec="${specification.id}" type="button">
                  <span><strong>${escapeHtml(specification.name)}</strong><small>${escapeHtml(getProject(specification.projectId)?.name || "без проекта")} · ${escapeHtml(specification.outputItem || "итог не задан")}</small></span>
                  <em>${escapeHtml(specification.revision || "-")}</em>
                </button>
              `).join("") : `
                <article class="module-empty-note">
                  <strong>BOM пока не включен в спецификации</strong>
                  <span>После сохранения BOM откройте модуль «Спецификации» и выберите его как BOM A или BOM B.</span>
                </article>
              `}
            </div>
          </section>

          <section class="module-panel bom-import-table-panel">
            <div class="report-card-head">
              <strong>03 · Таблица импортированного BOM</strong>
              <span>${importRows.length ? `${escapeHtml(bom.sourceFileName || bom.name)} · ${importRows.length} строк` : "после импорта здесь появятся строки A:I"}</span>
            </div>
            ${renderBomImportTable(importHeaders, importRows)}
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderBomImportTable(headers, rows) {
  if (!rows.length) {
    return `
      <div class="bom-import-empty">
        ${icon("upload")}
        <strong>Файл еще не импортирован</strong>
        <span>Выберите Excel-шаблон BOM. Система сохранит строки до первой пустой ячейки A и покажет результат в этой таблице.</span>
      </div>
    `;
  }

  return `
    <div class="bom-import-table-wrap" data-layout="table">
      <table class="directory-table bom-import-table">
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              ${row.values.map((value, index) => `<td class="${index === 1 ? "primary-cell" : ""}">${escapeHtml(value)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function getRoutesForModule() {
  return [...(planningState.routes || [])].sort((left, right) => {
    const leftProject = getProject(left.projectId)?.name || "";
    const rightProject = getProject(right.projectId)?.name || "";
    return leftProject.localeCompare(rightProject, "ru") || String(left.name || "").localeCompare(String(right.name || ""), "ru");
  });
}

function getRouteStepsForModule(routeId) {
  return (planningState.routeSteps || [])
    .filter((step) => step.routeId === routeId)
    .sort((left, right) => Number(left.stepOrder || 0) - Number(right.stepOrder || 0));
}

function getProjectRouteForModule(projectId) {
  return (planningState.routes || []).find((route) => route.projectId === projectId && route.isDefault)
    || (planningState.routes || []).find((route) => route.projectId === projectId)
    || null;
}

function getActiveRouteForModule() {
  if (ui.activeRouteId === "__new__") return null;
  const routes = getRoutesForModule();
  return routes.find((route) => route.id === ui.activeRouteId)
    || getProjectRouteForModule(ui.activeProjectId)
    || routes[0]
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

function renderRoutesPage() {
  const activeRoute = getActiveRouteForModule();
  const isNewRoute = ui.activeRouteId === "__new__" || !activeRoute;
  const defaultProjectId = activeRoute?.projectId || ui.activeProjectId || planningState.projects[0]?.id || "";
  const route = activeRoute || {
    id: "",
    projectId: defaultProjectId,
    name: "Новая маршрутная карта",
    isDefault: true,
  };
  const project = getProject(route.projectId);
  const stats = getRouteModuleStats(activeRoute);
  const projectOptions = planningState.projects.map((item) => ({
    value: item.id,
    label: item.name,
    meta: `${item.orderNumber} · ${PROJECT_STATUS_LABELS[item.status] || item.status || "статус"}`,
  }));

  return `
    <section class="routes-page module-data-page" data-layout="main-content" aria-label="Маршрутные карты">
      <aside class="directory-sidebar module-data-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Технология</span>
          <h1>Маршруты</h1>
        </div>
        <div class="module-sidebar-actions">
          <button class="primary-button" data-route-create type="button">${icon("plus")}<span>Новая карта</span></button>
        </div>
        <div class="module-entity-list">
          <div class="module-list-label">Маршрутные карты проектов</div>
          ${isNewRoute ? `<button class="module-entity-item is-active" type="button"><span><strong>Новая маршрутная карта</strong><small>${escapeHtml(getProject(defaultProjectId)?.name || "выберите проект")}</small></span><em>new</em></button>` : ""}
          ${getRoutesForModule().map((item) => {
            const routeProject = getProject(item.projectId);
            const steps = getRouteStepsForModule(item.id);
            return `
              <button class="module-entity-item ${item.id === activeRoute?.id ? "is-active" : ""}" data-route-open="${item.id}" type="button">
                <span>
                  <strong>${escapeHtml(item.name || "Маршрутная карта")}</strong>
                  <small>${escapeHtml(routeProject?.name || "проект не найден")} · ${steps.length} шагов</small>
                </span>
                <em>${item.isDefault ? "осн." : steps.length}</em>
              </button>
            `;
          }).join("")}
        </div>
      </aside>

      <div class="directory-workspace module-data-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Маршрутная карта</span>
            <h2>${escapeHtml(isNewRoute ? "Новая маршрутная карта" : route.name || "Маршрутная карта")}</h2>
            <p>${escapeHtml(project ? `${project.name}: последовательность отделов и нормативов для передачи в Gantt.` : "Выберите проект и задайте последовательность операций.")}</p>
          </div>
          <div class="directory-actions">
            <button class="secondary-button" data-route-to-project type="button" ${project ? "" : "disabled"}>${icon("book")}<span>Проект</span></button>
            <button class="secondary-button" data-route-to-calculator type="button" ${project ? "" : "disabled"}>${icon("calculator")}<span>Калькулятор</span></button>
            <button class="primary-button" data-route-to-planning type="button" ${project ? "" : "disabled"}>${icon("calendar")}<span>В план</span></button>
          </div>
        </header>

        <div class="module-data-content route-module-content">
          <section class="module-panel route-editor-panel">
            <div class="report-card-head">
              <strong>01 · Карточка маршрута</strong>
              <span>${isNewRoute ? "создание технологической карты" : "проект, статус и применение в плане"}</span>
            </div>
            <form id="routeModuleForm" class="module-form route-module-form">
              <input type="hidden" name="routeId" value="${escapeAttribute(route.id)}" />
              <input type="hidden" name="isNew" value="${isNewRoute ? "yes" : "no"}" />
              <label class="form-field full"><span>Название маршрутной карты</span><input name="name" value="${escapeAttribute(route.name || "")}" placeholder="Основной маршрут" /></label>
              <label class="form-field full">
                <span>Проект</span>
                ${renderDenseInlineSelect("projectId", route.projectId, projectOptions, { type: "routeModule" })}
              </label>
              <label class="route-default-toggle full">
                <input name="isDefault" type="checkbox" ${route.isDefault ? "checked" : ""} />
                <span><strong>Использовать как основной маршрут проекта</strong><small>Gantt и очередь операций будут брать эту карту по умолчанию.</small></span>
              </label>
              <div class="module-form-actions full">
                <button class="primary-button" type="submit">${icon("save")}<span>${isNewRoute ? "Создать карту" : "Сохранить карту"}</span></button>
              </div>
            </form>
          </section>

          <section class="module-panel route-summary-panel">
            <div class="report-card-head">
              <strong>02 · Сводка</strong>
              <span>готовность маршрута для планирования</span>
            </div>
            <div class="module-kpi-grid route-kpi-grid">
              <article><span>Шагов</span><strong>${stats.steps.length}</strong><small>${stats.required} обязательных</small></article>
              <article><span>В Gantt</span><strong>${stats.slots.length}</strong><small>операций используют карту</small></article>
              <article><span>Часы</span><strong>${formatReportNumber(stats.hours)}</strong><small>по текущему плану</small></article>
              <article><span>Сигналы</span><strong>${stats.warnings.length}</strong><small>по проекту</small></article>
            </div>
            ${renderRouteModuleSequence(stats.steps)}
          </section>

          <section class="module-panel route-steps-panel">
            <div class="report-card-head">
              <strong>03 · Операции маршрута</strong>
              <span>${stats.steps.length ? "кликните поле, чтобы изменить участок, норматив или обязательность" : "сначала сохраните карту, затем добавьте операции"}</span>
            </div>
            <div class="route-step-toolbar">
              <button class="secondary-button" data-route-add-step type="button" ${activeRoute ? "" : "disabled"}>${icon("plus")}<span>Добавить операцию</span></button>
            </div>
            ${renderRouteStepsEditor(activeRoute, stats.steps)}
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderRouteModuleSequence(steps) {
  if (!steps.length) {
    return `
      <div class="route-module-empty">
        ${icon("split")}
        <strong>Маршрут пока пустой</strong>
        <span>Добавьте операции в нужной последовательности. Конечный складской шаг можно оставить последним.</span>
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
            <span><strong>${escapeHtml(step.operationName || "Операция")}</strong><small>${escapeHtml(center?.name || step.workCenterId || "участок")}</small></span>
          </article>
        `;
      }).join("")}
    </div>
  `;
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

  if (!steps.length) {
    return `
      <div class="route-module-empty">
        ${icon("plus")}
        <strong>Операций нет</strong>
        <span>Добавьте первый шаг маршрута. После сохранения Gantt сможет использовать эту последовательность.</span>
      </div>
    `;
  }

  const workCenterOptions = planningState.workCenters.map((center) => ({
    value: center.id,
    label: center.name,
    meta: center.code || "участок",
  }));

  return `
    <div class="route-step-editor-list">
      ${steps.map((step, index) => `
        <article class="route-step-editor-row ${step.workCenterId === "warehouse" ? "is-warehouse" : ""}" data-route-step-row="${step.id}">
          <div class="route-step-index">
            <button class="icon-button" data-route-step-up="${step.id}" type="button" title="Поднять" ${index === 0 ? "disabled" : ""}>${icon("chevronUp")}</button>
            <input data-route-step-input="${step.id}" data-route-step-field="stepOrder" type="number" min="1" step="1" value="${Number(step.stepOrder || index + 1)}" aria-label="Порядок операции" />
            <button class="icon-button" data-route-step-down="${step.id}" type="button" title="Опустить" ${index === steps.length - 1 ? "disabled" : ""}>${icon("chevronDown")}</button>
          </div>
          <label class="form-field route-step-name">
            <span>Операция</span>
            <input data-route-step-input="${step.id}" data-route-step-field="operationName" value="${escapeAttribute(step.operationName || "")}" />
          </label>
          <label class="form-field route-step-center">
            <span>Участок</span>
            ${renderDenseInlineSelect("workCenterId", step.workCenterId, workCenterOptions, { type: "routeStep", stepId: step.id })}
          </label>
          <label class="form-field route-step-number">
            <span>Плат/час</span>
            <input data-route-step-input="${step.id}" data-route-step-field="unitsPerHour" type="number" min="0" step="0.1" value="${Number(step.unitsPerHour || getWorkCenterUnitsPerHour(step.workCenterId) || 0)}" />
          </label>
          <label class="form-field route-step-number">
            <span>Setup, мин</span>
            <input data-route-step-input="${step.id}" data-route-step-field="setupMin" type="number" min="0" step="1" value="${Number(step.setupMin || 0)}" />
          </label>
          <label class="route-required-toggle">
            <input data-route-step-required="${step.id}" type="checkbox" ${step.isRequired ? "checked" : ""} />
            <span>Обязательная</span>
          </label>
          <button class="icon-button danger-soft" data-route-step-delete="${step.id}" type="button" title="Удалить операцию">${icon("trash")}</button>
        </article>
      `).join("")}
    </div>
  `;
}

function renderDirectoryPage() {
  const visibleSections = getVisibleDirectorySections();
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
          ${visibleSections.map((section) => `
            <button class="directory-nav-item ${section.id === activeSection.id ? "is-active" : ""}" data-directory-id="${section.id}" type="button">
              <span>
                <strong>${escapeHtml(section.label)}</strong>
                <small>${escapeHtml(section.description)}</small>
              </span>
              <em>${section.count()}</em>
            </button>
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

function renderReportsPage() {
  const activeReport = reportSections.find((section) => section.id === ui.activeReport) || reportSections[0];
  const isDashboardReport = activeReport.id === "dashboard";
  const reportData = isDashboardReport ? null : getReportData(activeReport.id);

  return `
    <section class="reports-page" data-layout="main-content" aria-label="Отчеты MES">
      <aside class="report-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">Аналитика</span>
          <h1>Отчеты</h1>
        </div>
        <div class="directory-nav">
          ${reportSections.map((section) => `
            <button class="directory-nav-item ${section.id === activeReport.id ? "is-active" : ""}" data-report-id="${section.id}" type="button">
              <span>
                <strong>${escapeHtml(section.label)}</strong>
                <small>${escapeHtml(section.description)}</small>
              </span>
              <em>${section.count()}</em>
            </button>
          `).join("")}
        </div>
      </aside>

      <div class="report-workspace ${isDashboardReport ? "report-dashboard-workspace" : ""}" data-layout="page-workspace">
        ${isDashboardReport ? renderDashboardPage({ embedded: true }) : `
          <header class="directory-header">
            <div>
              <span class="eyebrow">Отчет</span>
              <h2>${escapeHtml(reportData.title)}</h2>
              <p>${escapeHtml(reportData.description)}</p>
            </div>
            <div class="directory-actions">
              <button class="secondary-button" data-report-refresh type="button">${icon("refresh")}<span>Обновить</span></button>
              <button class="primary-button" type="button">${icon("download")}<span>Экспорт</span></button>
            </div>
          </header>

          <div class="report-content">
            <section class="report-main">
              <div class="kpi-row">
                ${reportData.kpis.map((kpi) => `
                  <article class="kpi-card">
                    <span>${escapeHtml(kpi.label)}</span>
                    <strong>${escapeHtml(kpi.value)}</strong>
                    <small>${escapeHtml(kpi.caption)}</small>
                  </article>
                `).join("")}
              </div>
              <div class="report-chart-grid">
                ${reportData.charts.map((chart) => renderReportChart(chart)).join("")}
              </div>
              ${renderReportTable(reportData.table)}
            </section>

            <aside class="report-insights">
              <div class="detail-card-head">
                <span class="eyebrow">Итоги</span>
                <h3>${escapeHtml(reportData.insightTitle)}</h3>
              </div>
              <div class="insight-list">
                ${reportData.insights.map((insight) => `
                  <div class="insight-item ${insight.tone || ""}">
                    ${icon(insight.icon || "info")}
                    <span>${escapeHtml(insight.text)}</span>
                  </div>
                `).join("")}
              </div>
            </aside>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderDebugPage() {
  return `
    <section class="debug-page" data-layout="main-content" aria-label="Отладка интерфейса">
      <aside class="debug-sidebar">
        <div class="directory-sidebar-head">
          <span class="eyebrow">UI Playground</span>
          <h1>Отладка</h1>
        </div>
        <div class="debug-index">
          <a href="#debug-selects"><strong>DS</strong><span>Выпадающие списки</span></a>
          <a href="#debug-popups"><strong>POP</strong><span>Попапы и подсказки</span></a>
          <a href="#debug-modals"><strong>MOD</strong><span>Модальные окна</span></a>
          <a href="#debug-steppers"><strong>STP</strong><span>Пошаговые процессы</span></a>
          <a href="#debug-spec-builder"><strong>SPEC</strong><span>Конструктор спецификаций</span></a>
          <a href="#debug-usage"><strong>USE</strong><span>Как задавать в задачах</span></a>
        </div>
      </aside>

      <div class="debug-workspace" data-layout="page-workspace">
        <header class="directory-header">
          <div>
            <span class="eyebrow">Отладка визуальных паттернов</span>
            <h2>Варианты dropdown, popup, modal и stepper</h2>
            <p>Каждый вариант имеет короткое имя. Его можно использовать в следующих заданиях: например, "применить STP-02 для маршрутной карты".</p>
          </div>
          <div class="directory-actions">
            <button class="secondary-button" data-debug-overlay="modal-confirm" type="button">${icon("info")}<span>Пример confirm</span></button>
            <button class="primary-button" data-debug-overlay="modal-form" type="button">${icon("edit")}<span>Пример формы</span></button>
          </div>
        </header>

        <div class="debug-content">
          <section class="debug-section" id="debug-selects">
            <div class="debug-section-head">
              <div>
                <span class="eyebrow">DS · Dropdown Select</span>
                <h3>Варианты выпадающих списков</h3>
              </div>
              <span class="status-pill neutral">6 вариантов</span>
            </div>
            <div class="debug-card-grid">
              ${renderDebugSelectCards()}
            </div>
          </section>

          <section class="debug-section" id="debug-popups">
            <div class="debug-section-head">
              <div>
                <span class="eyebrow">POP · Popup</span>
                <h3>Варианты попапов</h3>
              </div>
              <span class="status-pill neutral">4 варианта</span>
            </div>
            <div class="debug-card-grid">
              ${renderDebugPopupCards()}
            </div>
          </section>

          <section class="debug-section" id="debug-modals">
            <div class="debug-section-head">
              <div>
                <span class="eyebrow">MOD · Modal</span>
                <h3>Варианты модальных окон</h3>
              </div>
              <span class="status-pill neutral">4 варианта</span>
            </div>
            <div class="debug-modal-grid">
              <article class="debug-card">
                <div class="debug-card-title"><code>MOD-01</code><strong>Confirm Compact</strong></div>
                <p>Короткое подтверждение опасного или необратимого действия.</p>
                <button class="secondary-button" data-debug-overlay="modal-confirm" type="button">${icon("alert")}<span>Открыть MOD-01</span></button>
              </article>
              <article class="debug-card">
                <div class="debug-card-title"><code>MOD-02</code><strong>Form Modal</strong></div>
                <p>Основная форма добавления или редактирования записи справочника.</p>
                <button class="primary-button" data-debug-overlay="modal-form" type="button">${icon("edit")}<span>Открыть MOD-02</span></button>
              </article>
              <article class="debug-card">
                <div class="debug-card-title"><code>MOD-03</code><strong>Right Detail Drawer</strong></div>
                <p>Боковая карточка подробностей без потери контекста таблицы или диаграммы.</p>
                <button class="secondary-button" data-debug-overlay="drawer-detail" type="button">${icon("chevronRight")}<span>Открыть MOD-03</span></button>
              </article>
              <article class="debug-card">
                <div class="debug-card-title"><code>MOD-04</code><strong>Wizard Modal</strong></div>
                <p>Пошаговый сценарий: выбор проекта, спецификации, BOM и маршрутной карты.</p>
                <button class="secondary-button" data-debug-overlay="modal-wizard" type="button">${icon("check")}<span>Открыть MOD-04</span></button>
              </article>
            </div>
          </section>

          <section class="debug-section" id="debug-steppers">
            <div class="debug-section-head">
              <div>
                <span class="eyebrow">STP · Stepper / Process Flow</span>
                <h3>Варианты пошагового заполнения</h3>
              </div>
              <span class="status-pill neutral">4 варианта</span>
            </div>
            <div class="debug-stepper-grid">
              ${renderDebugStepperCards()}
            </div>
          </section>

          <section class="debug-section" id="debug-spec-builder">
            <div class="debug-section-head">
              <div>
                <span class="eyebrow">SPEC · Product Specification Builder</span>
                <h3>Конструктор спецификаций изделий</h3>
              </div>
              <span class="status-pill neutral">7 вариантов</span>
            </div>
            <div class="debug-spec-grid">
              ${renderDebugSpecificationBuilder()}
            </div>
          </section>

          <section class="debug-section debug-usage" id="debug-usage">
            <div class="debug-section-head">
              <div>
                <span class="eyebrow">USE · Naming</span>
                <h3>Как ссылаться в задачах</h3>
              </div>
            </div>
            <div class="debug-usage-grid">
              <div><code>DS-03</code><span>Использовать command-search dropdown для выбора проекта или BOM.</span></div>
              <div><code>POP-02</code><span>Использовать validation tooltip для ошибок ввода.</span></div>
              <div><code>MOD-03</code><span>Использовать right detail drawer для просмотра операции на Gantt.</span></div>
              <div><code>MOD-04</code><span>Использовать wizard modal для сложного сценария заполнения.</span></div>
              <div><code>STP-01</code><span>Использовать guided form stepper для длинных форм с обязательной последовательностью.</span></div>
              <div><code>STP-02</code><span>Использовать vertical process stepper для подготовки к планированию.</span></div>
              <div><code>STP-03</code><span>Использовать process flow для статуса прохождения проекта по участкам.</span></div>
              <div><code>SPEC-01</code><span>Использовать спецификацию-дерево для изделия из нескольких плат, корпуса и комплектующих.</span></div>
              <div><code>SPEC-04</code><span>Использовать drag assembly canvas, когда нужно собирать изделие из BOM и складских позиций.</span></div>
              <div><code>SPEC-05</code><span>Использовать dependency graph, когда важнее показать связи проект → спецификация → BOM → изделие.</span></div>
              <div><code>SPEC-06</code><span>Использовать split pane inspector для детального редактирования выбранного узла спецификации.</span></div>
              <div><code>SPEC-07</code><span>Использовать quantity impact matrix для проверки количества и влияния на планирование.</span></div>
            </div>
          </section>
        </div>
      </div>
      ${renderDebugOverlay()}
    </section>
  `;
}

function renderDebugSpecificationBuilder() {
  return `
    <div class="debug-segment-label">
      <code>01</code>
      <div><strong>Базовая сборка спецификации</strong><span>Иерархия изделия, компактный список и проверка готовности перед маршрутной картой.</span></div>
    </div>

    <article class="debug-card spec-builder-card wide">
      <div class="debug-card-title"><code>SPEC-01</code><strong>Tree BOM Assembly Builder</strong></div>
      <p>Дерево изделия показывает итоговый продукт, вложенные смонтированные платы из BOM и дополнительные элементы спецификации.</p>
      <div class="spec-builder-layout">
        <div class="spec-tree-panel">
          <div class="spec-tree-root">
            <strong>Готовое изделие MES-001</strong>
            <small>СП MES-001 · рев. C · проект p-mes</small>
          </div>
          <div class="spec-tree-branch">
            <span>1x</span>
            <div><strong>Смонтированная основная плата MES</strong><small>BOM MES Main PCB · PCB-MES-MAIN</small></div>
            <em>результат BOM</em>
          </div>
          <div class="spec-tree-branch">
            <span>2x</span>
            <div><strong>Смонтированная плата ввода-вывода MES</strong><small>BOM MES IO PCB · PCB-MES-IO</small></div>
            <em>результат BOM</em>
          </div>
          <div class="spec-tree-branch extra">
            <span>1x</span>
            <div><strong>Корпус IP54</strong><small>механическая часть · складская позиция</small></div>
            <em>доп. состав</em>
          </div>
          <div class="spec-tree-branch extra">
            <span>1x</span>
            <div><strong>DIN-крепление, шильдик, кабельный ввод</strong><small>комплект сборки</small></div>
            <em>комплект</em>
          </div>
        </div>
        <aside class="spec-builder-side">
          <div class="spec-builder-field">
            <span>Проект</span>
            <details class="debug-inline-select">
              <summary><strong>Готовое изделие MES-001</strong>${icon("chevronDown")}</summary>
              <div class="debug-inline-options">
                <button type="button">Плата управления X100</button>
                <button type="button">Контроллер питания V2</button>
                <button type="button">Готовое изделие MES-001</button>
              </div>
            </details>
          </div>
          <div class="spec-builder-actions">
            <button class="secondary-button" type="button">${icon("plus")}<span>Добавить BOM-узел</span></button>
            <button class="secondary-button" type="button">${icon("plus")}<span>Добавить комплектующее</span></button>
            <button class="primary-button" type="button">${icon("save")}<span>Сохранить спецификацию</span></button>
          </div>
        </aside>
      </div>
    </article>

    <article class="debug-card spec-builder-card">
      <div class="debug-card-title"><code>SPEC-02</code><strong>Dense Component List</strong></div>
      <p>Плотный список строк спецификации: удобно для быстрого редактирования количества и типа позиции.</p>
      <div class="spec-line-list">
        <div><strong>Тип</strong><strong>Позиция</strong><strong>Кол-во</strong></div>
        <div><span>BOM</span><strong>BOM MES Main PCB</strong><em>1</em></div>
        <div><span>BOM</span><strong>BOM MES IO PCB</strong><em>2</em></div>
        <div><span>Part</span><strong>Корпус IP54</strong><em>1</em></div>
        <div><span>Kit</span><strong>DIN-крепление + шильдик</strong><em>1</em></div>
      </div>
    </article>

    <article class="debug-card spec-builder-card">
      <div class="debug-card-title"><code>SPEC-03</code><strong>Validation Summary</strong></div>
      <p>Сводка готовности спецификации перед передачей в маршрутную карту и планирование.</p>
      <div class="spec-validation-list">
        <div class="ok">${icon("check")}<span>BOM-узлы привязаны к справочнику BOM</span></div>
        <div class="ok">${icon("check")}<span>Итоговое изделие задано</span></div>
        <div class="warning">${icon("alert")}<span>Для корпуса не указан поставщик</span></div>
        <div>${icon("info")}<span>Маршрутная карта использует спецификацию как состав изделия</span></div>
      </div>
    </article>

    <div class="debug-segment-label">
      <code>02</code>
      <div><strong>Механики конструктора</strong><span>Перетягивание, сборочная канва и детальное редактирование выбранного узла.</span></div>
    </div>

    <article class="debug-card spec-builder-card wide">
      <div class="debug-card-title"><code>SPEC-04</code><strong>Drag Assembly Canvas</strong></div>
      <p>Механика drag-and-drop: слева палитра доступных BOM и складских позиций, в центре область сборки, справа быстрый инспектор.</p>
      <div class="spec-drag-layout">
        <div class="spec-palette">
          <span class="spec-panel-caption">Палитра</span>
          <button class="spec-palette-card" data-spec-palette-card data-spec-type="BOM" data-spec-title="BOM MES Main PCB" draggable="true" type="button"><b>BOM</b><strong>BOM MES Main PCB</strong><small>результат: основная плата</small></button>
          <button class="spec-palette-card" data-spec-palette-card data-spec-type="BOM" data-spec-title="BOM MES IO PCB" draggable="true" type="button"><b>BOM</b><strong>BOM MES IO PCB</strong><small>результат: плата ввода-вывода</small></button>
          <button class="spec-palette-card" data-spec-palette-card data-spec-type="Part" data-spec-title="Корпус IP54" draggable="true" type="button"><b>Part</b><strong>Корпус IP54</strong><small>складская позиция</small></button>
        </div>
        <div class="spec-drop-canvas">
          <span class="spec-panel-caption">Область спецификации</span>
          <div class="spec-drop-zone" data-spec-drop-zone>
            <strong>Готовое изделие MES-001</strong>
            <small>перетащите BOM или нажмите элемент палитры</small>
          </div>
          <div class="spec-stack-item is-linked"><span>1x</span><strong>BOM MES Main PCB</strong><em>привязан</em></div>
          <div class="spec-stack-item is-dragging"><span>2x</span><strong>BOM MES IO PCB</strong><em>перетаскивается</em></div>
          <div class="spec-stack-item"><span>1x</span><strong>Корпус IP54</strong><em>доп. состав</em></div>
        </div>
        <aside class="spec-inspector-panel compact">
          <span class="spec-panel-caption">Инспектор узла</span>
          <div><strong>BOM MES IO PCB</strong><small>тип: результат SMT-операции</small></div>
          <label><span>Количество</span><input value="2" inputmode="numeric" aria-label="Количество BOM MES IO PCB"></label>
          <button class="primary-button" type="button">${icon("check")}<span>Применить</span></button>
        </aside>
      </div>
    </article>

    <article class="debug-card spec-builder-card">
      <div class="debug-card-title"><code>SPEC-05</code><strong>Dependency Graph</strong></div>
      <p>Визуализация связей: хорошо показывает, что BOM производит смонтированную плату, а спецификация собирает итоговое изделие.</p>
      <div class="spec-graph">
        <div class="spec-graph-node project"><b>Project</b><strong>MES-001</strong><small>240 изделий</small></div>
        <span class="spec-graph-arrow">${icon("arrowRight")}</span>
        <div class="spec-graph-node spec"><b>Spec</b><strong>СП MES-001</strong><small>рев. C</small></div>
        <div class="spec-graph-node bom"><b>BOM</b><strong>Main PCB</strong><small>1x</small></div>
        <span class="spec-graph-arrow">${icon("arrowRight")}</span>
        <div class="spec-graph-node output"><b>Result</b><strong>Готовое изделие</strong><small>склад</small></div>
        <div class="spec-graph-node bom"><b>BOM</b><strong>IO PCB</strong><small>2x</small></div>
        <span class="spec-graph-arrow muted">${icon("arrowRight")}</span>
        <div class="spec-graph-node part"><b>Part</b><strong>Корпус + DIN</strong><small>комплект</small></div>
      </div>
    </article>

    <article class="debug-card spec-builder-card">
      <div class="debug-card-title"><code>SPEC-06</code><strong>Split Pane Inspector</strong></div>
      <p>Слева навигация по дереву, справа карточка выбранного узла. Удобно для редактирования свойств без модалки.</p>
      <div class="spec-split-layout">
        <div class="spec-mini-tree">
          <button class="is-active" type="button"><span>1</span><strong>MES-001</strong></button>
          <button type="button"><span>1.1</span><strong>Main PCB</strong></button>
          <button type="button"><span>1.2</span><strong>IO PCB</strong></button>
          <button type="button"><span>1.3</span><strong>Корпус</strong></button>
        </div>
        <div class="spec-inspector-panel">
          <span class="spec-panel-caption">Выбранный узел</span>
          <strong>Смонтированная плата ввода-вывода MES</strong>
          <small>BOM MES IO PCB · результат SMT-операции</small>
          <div class="spec-field-grid">
            <span>Тип</span><b>BOM</b>
            <span>Количество</span><b>2 шт.</b>
            <span>Источник</span><b>Справочник BOM</b>
            <span>Контроль</span><b>AOI обязателен</b>
          </div>
        </div>
      </div>
    </article>

    <div class="debug-segment-label">
      <code>03</code>
      <div><strong>Проверка состава и влияния на план</strong><span>Матрица количества, готовность данных и влияние спецификации на расчет маршрутной карты.</span></div>
    </div>

    <article class="debug-card spec-builder-card wide">
      <div class="debug-card-title"><code>SPEC-07</code><strong>Quantity Impact Matrix</strong></div>
      <p>Матрица показывает, как количество в спецификации превращается в потребность BOM, операции SMT и конечный складской выпуск.</p>
      <div class="spec-impact-layout">
        <div class="spec-impact-table">
          <div class="spec-impact-head"><span>Узел</span><span>Кол.</span><span>На заказ</span><span>Операция</span><span>Статус</span></div>
          <div><strong>BOM MES Main PCB</strong><span>1x</span><span>240 плат</span><span>SMT-01</span><em class="ok">готово</em></div>
          <div><strong>BOM MES IO PCB</strong><span>2x</span><span>480 плат</span><span>SMT-02</span><em class="ok">готово</em></div>
          <div><strong>Корпус IP54</strong><span>1x</span><span>240 шт.</span><span>Сборка</span><em class="warn">поставщик</em></div>
          <div><strong>DIN-комплект</strong><span>1x</span><span>240 шт.</span><span>Склад</span><em>резерв</em></div>
        </div>
        <aside class="spec-impact-summary">
          <div><b>2</b><span>BOM-операции для калькулятора</span></div>
          <div><b>720</b><span>плат к монтажу по спецификации</span></div>
          <div><b>1</b><span>предупреждение до планирования</span></div>
        </aside>
      </div>
    </article>
  `;
}

function renderDebugStepperCards() {
  return `
    <article class="debug-card debug-stepper-card wide">
      <div class="debug-card-title"><code>STP-01</code><strong>Guided Form Stepper</strong></div>
      <p>Пошаговое заполнение длинной формы: каждый шаг открывает следующий блок и снижает перегрузку полями.</p>
      <div class="guided-stepper">
        <div class="guided-step is-done">
          <span>1</span>
          <strong>Проект</strong>
          <small>Заказ, клиент, срок</small>
        </div>
        <div class="guided-step is-active">
          <span>2</span>
          <strong>Спецификация</strong>
          <small>Состав изделия</small>
        </div>
        <div class="guided-step">
          <span>3</span>
          <strong>BOM SMT</strong>
          <small>Компоненты платы</small>
        </div>
        <div class="guided-step">
          <span>4</span>
          <strong>Маршрут</strong>
          <small>Операции и время</small>
        </div>
      </div>
      <div class="guided-form-preview">
        <label class="field command-field">
          <span>Спецификация изделия</span>
          <select><option>СП X100 · рев. A</option></select>
        </label>
        <div class="stepper-note ok">${icon("check")}<span>Шаг 1 завершен, можно выбирать спецификацию.</span></div>
      </div>
    </article>

    <article class="debug-card debug-stepper-card">
      <div class="debug-card-title"><code>STP-02</code><strong>Vertical Process Stepper</strong></div>
      <p>Вертикальная последовательность для подготовки данных до Gantt.</p>
      <ol class="vertical-stepper">
        <li class="is-done">
          <span>${icon("check")}</span>
          <div><strong>Проект выбран</strong><small>Количество и срок подтянуты из заказа.</small></div>
        </li>
        <li class="is-active">
          <span>2</span>
          <div><strong>Спецификация и BOM</strong><small>Проверить состав изделия и SMT-компоненты.</small></div>
        </li>
        <li>
          <span>3</span>
          <div><strong>Маршрутная карта</strong><small>Участки, ресурсы, setup и нормативы.</small></div>
        </li>
        <li>
          <span>4</span>
          <div><strong>Передача в план</strong><small>Сохранить маршрут и перейти к диаграмме.</small></div>
        </li>
      </ol>
    </article>

    <article class="debug-card debug-stepper-card wide">
      <div class="debug-card-title"><code>STP-03</code><strong>Horizontal Process Flow</strong></div>
      <p>Горизонтальный поток для статуса прохождения проекта через отделы и контрольные точки.</p>
      <div class="process-flow">
        <div class="flow-node is-done"><em>01</em><strong>BOM</strong><span>готов</span></div>
        ${icon("chevronRight")}
        <div class="flow-node is-done"><em>02</em><strong>SMT</strong><span>рассчитан</span></div>
        ${icon("chevronRight")}
        <div class="flow-node is-active"><em>03</em><strong>Маршрут</strong><span>в работе</span></div>
        ${icon("chevronRight")}
        <div class="flow-node"><em>04</em><strong>Gantt</strong><span>ожидает</span></div>
        ${icon("chevronRight")}
        <div class="flow-node"><em>05</em><strong>Склад</strong><span>финал</span></div>
      </div>
      <div class="process-flow-caption">
        <span>Лучше использовать в шапке проекта, дашборде или карточке маршрутной карты.</span>
      </div>
    </article>

    <article class="debug-card debug-stepper-card">
      <div class="debug-card-title"><code>STP-04</code><strong>Block Completion Stepper</strong></div>
      <p>Мини-степпер поверх существующих блоков калькулятора: показывает, что заполнено, а где есть пробел.</p>
      <div class="block-stepper">
        <div class="is-done">
          <span>${icon("check")}</span>
          <strong>Входные данные</strong>
          <small>проект, заказ, мультипликация</small>
        </div>
        <div class="is-done">
          <span>${icon("check")}</span>
          <strong>BOM SMT</strong>
          <small>108 компонентов / плата</small>
        </div>
        <div class="is-active">
          <span>3</span>
          <strong>Маршрут</strong>
          <small>проверить ручной монтаж</small>
        </div>
        <div class="is-warning">
          <span>${icon("alert")}</span>
          <strong>Сохранение</strong>
          <small>требует подтверждения</small>
        </div>
      </div>
    </article>
  `;
}

function renderDebugSelectCards() {
  return `
    <article class="debug-card">
      <div class="debug-card-title"><code>DS-01</code><strong>Command Search Select</strong></div>
      <p>Компактный command-search для выбора проекта без системного select.</p>
      <div class="debug-combobox">
        <div class="debug-command-input">${icon("search")}<span>Плата управления X100</span><em>Ctrl K</em></div>
        <div class="debug-dropdown-panel">
          <button type="button"><strong>Плата управления X100</strong><small>Заказ 1452 · срок 18.06</small></button>
          <button type="button"><strong>Контроллер питания V2</strong><small>Заказ 1461 · SMT + тест</small></button>
          <button type="button"><strong>Готовое изделие MES-001</strong><small>2 платы + корпус</small></button>
        </div>
      </div>
    </article>

    <article class="debug-card">
      <div class="debug-card-title"><code>DS-02</code><strong>Dense Inline Select</strong></div>
      <p>Компактный выбор внутри таблиц, строк маршрута и фильтров.</p>
      <div class="debug-dense-row">
        <span>Участок</span>
        <details class="debug-inline-select">
          <summary><strong>SMT-монтаж</strong>${icon("chevronDown")}</summary>
          <div class="debug-inline-options">
            <button type="button">SMT-монтаж</button>
            <button type="button">AOI-контроль</button>
            <button type="button">Отмывка</button>
            <button type="button">Тестирование</button>
          </div>
        </details>
      </div>
      <div class="debug-mini-list">
        <span>клик по полю открывает список</span><span>для таблиц</span><span>для маршрутов</span>
      </div>
    </article>

    <article class="debug-card">
      <div class="debug-card-title"><code>DS-03</code><strong>Command Search Dropdown</strong></div>
      <p>Лучший вариант для проектов, BOM и спецификаций: поиск, метаданные, быстрый выбор.</p>
      <div class="debug-combobox">
        <div class="debug-command-input">${icon("search")}<span>BOM X100 PCB</span><em>Ctrl K</em></div>
        <div class="debug-dropdown-panel">
          <button type="button"><strong>BOM X100 PCB</strong><small>PCB-X100 · 108 компонентов</small></button>
          <button type="button"><strong>BOM PWR V2</strong><small>PCB-PWR-V2 · 121 компонент</small></button>
          <button type="button"><strong>BOM MES Main</strong><small>PCB-MES-MAIN · 177 компонентов</small></button>
        </div>
      </div>
    </article>

    <article class="debug-card">
      <div class="debug-card-title"><code>DS-04</code><strong>Multi Select Chips</strong></div>
      <p>Для фильтров по нескольким статусам, участкам или ответственным.</p>
      <div class="debug-chip-select">
        <span>SMT</span><span>AOI</span><span>Тест</span>
        <button type="button">${icon("plus")}</button>
      </div>
      <div class="debug-check-list">
        <label><input type="checkbox" checked /> В работе</label>
        <label><input type="checkbox" checked /> План</label>
        <label><input type="checkbox" /> Проблема</label>
      </div>
    </article>

    <article class="debug-card">
      <div class="debug-card-title"><code>DS-05</code><strong>Tree Link Select</strong></div>
      <p>Для связки проект -> спецификация -> BOM, когда нужно видеть иерархию.</p>
      <div class="debug-tree-select">
        <div><strong>Плата управления X100</strong><small>Проект №1452</small></div>
        <div><span>└ СП X100 · рев. A</span></div>
        <div><span>  └ BOM X100 PCB</span><em>выбран</em></div>
      </div>
    </article>

    <article class="debug-card">
      <div class="debug-card-title"><code>DS-06</code><strong>Status Palette Select</strong></div>
      <p>Для статусов и приоритетов, где цвет несет смысл.</p>
      <div class="debug-status-select">
        <button type="button"><i class="ok"></i><span>Готово</span></button>
        <button type="button"><i class="warning"></i><span>Проверка</span></button>
        <button type="button"><i class="critical"></i><span>Проблема</span></button>
      </div>
    </article>
  `;
}

function renderDebugPopupCards() {
  return `
    <article class="debug-card">
      <div class="debug-card-title"><code>POP-01</code><strong>Info Popover</strong></div>
      <p>Небольшая справка около поля без блокировки экрана.</p>
      <div class="debug-popover-stage">
        <button class="secondary-button" type="button">${icon("info")}<span>Норма времени</span></button>
        <div class="debug-popover">
          <strong>Норма времени</strong>
          <span>Расчет применяется к одной мультипликации с учетом setup.</span>
        </div>
      </div>
    </article>

    <article class="debug-card">
      <div class="debug-card-title"><code>POP-02</code><strong>Validation Tooltip</strong></div>
      <p>Ошибки формы рядом с проблемным контролом.</p>
      <div class="debug-validation">
        <label class="field">
          <span>Плат в мультипликации</span>
          <input value="0" />
        </label>
        <div class="debug-error-tip">${icon("alert")}<span>Значение должно быть больше 0.</span></div>
      </div>
    </article>

    <article class="debug-card">
      <div class="debug-card-title"><code>POP-03</code><strong>Action Menu</strong></div>
      <p>Контекстное меню действий строки таблицы.</p>
      <details class="debug-action-menu">
        <summary title="Открыть меню действий">${icon("edit")}</summary>
        <div class="debug-menu-panel">
          <button type="button">${icon("edit")}<span>Редактировать</span></button>
          <button type="button">${icon("download")}<span>Экспортировать</span></button>
          <button type="button" class="danger">${icon("trash")}<span>Удалить</span></button>
        </div>
      </details>
    </article>

    <article class="debug-card">
      <div class="debug-card-title"><code>POP-04</code><strong>Metric Drilldown</strong></div>
      <p>Раскрытие KPI с коротким списком причин или объектов.</p>
      <div class="debug-metric-popover">
        <div class="kpi-card"><span>Сигналы</span><strong>35</strong><small>2 крит. · 33 пред.</small></div>
        <div class="debug-popover wide">
          <strong>Топ причин</strong>
          <span>SMT перегружен · нехватка ресурса · срок заказа V2</span>
        </div>
      </div>
    </article>
  `;
}

function renderDebugOverlay() {
  if (!ui.debugOverlay) return "";

  if (ui.debugOverlay === "drawer-detail") {
    return `
      <div class="modal-backdrop debug-drawer-backdrop" data-debug-close>
        <aside class="debug-drawer" role="dialog" aria-modal="true" aria-label="MOD-03 Right Detail Drawer">
          <div class="drawer-header">
            <div>
              <span class="eyebrow">MOD-03 · Right Detail Drawer</span>
              <h2>Операция SMT-монтаж</h2>
            </div>
            <button class="icon-button" data-debug-close type="button" title="Закрыть">${icon("close")}</button>
          </div>
          <div class="drawer-summary status-in_progress">
            <div><span>Партия</span><strong>X100-B1</strong></div>
            <strong>970 шт.</strong>
          </div>
          <dl class="detail-grid">
            <div><dt>Участок</dt><dd>SMT-монтаж</dd></div>
            <div><dt>Ресурс</dt><dd>Линия SMT-1</dd></div>
            <div><dt>Время</dt><dd>6 ч 40 мин</dd></div>
            <div><dt>Статус</dt><dd>В работе</dd></div>
          </dl>
          <div class="drawer-actions">
            <button class="secondary-button" data-debug-close type="button">Закрыть</button>
            <button class="primary-button" data-debug-close type="button">${icon("edit")}<span>Редактировать</span></button>
          </div>
        </aside>
      </div>
    `;
  }

  if (ui.debugOverlay === "modal-wizard") {
    return `
      <div class="modal-backdrop" data-debug-close>
        <section class="modal large-modal debug-wizard-modal" role="dialog" aria-modal="true" aria-label="MOD-04 Wizard Modal">
          <div class="modal-header">
            <div>
              <span class="eyebrow">MOD-04 · Wizard Modal</span>
              <h2>Создание маршрутной карты</h2>
            </div>
            <button class="icon-button" data-debug-close type="button" title="Закрыть">${icon("close")}</button>
          </div>
          <div class="debug-steps">
            <span class="is-done">1 Проект</span>
            <span class="is-active">2 Спецификация</span>
            <span>3 BOM</span>
            <span>4 Маршрут</span>
          </div>
          <div class="form-grid">
            <label class="form-field">
              <span>Проект</span>
              <select><option>Плата управления X100</option></select>
            </label>
            <label class="form-field">
              <span>Спецификация</span>
              <select><option>СП X100 · A</option></select>
            </label>
            <label class="form-field full">
              <span>BOM для SMT</span>
              <select><option>BOM X100 PCB · Смонтированная плата X100</option></select>
            </label>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" data-debug-close type="button">Отмена</button>
            <button class="primary-button" data-debug-close type="button">${icon("chevronRight")}<span>Далее</span></button>
          </div>
        </section>
      </div>
    `;
  }

  if (ui.debugOverlay === "modal-form") {
    return `
      <div class="modal-backdrop" data-debug-close>
        <section class="modal large-modal" role="dialog" aria-modal="true" aria-label="MOD-02 Form Modal">
          <div class="modal-header">
            <div>
              <span class="eyebrow">MOD-02 · Form Modal</span>
              <h2>Редактирование BOM-листа</h2>
            </div>
            <button class="icon-button" data-debug-close type="button" title="Закрыть">${icon("close")}</button>
          </div>
          <div class="form-grid">
            <label class="form-field"><span>BOM</span><input value="BOM X100 PCB" /></label>
            <label class="form-field"><span>Ревизия</span><input value="A.2" /></label>
            <label class="form-field full"><span>Результат</span><input value="Смонтированная плата X100" /></label>
            <label class="form-field"><span>0402</span><input type="number" value="42" /></label>
            <label class="form-field"><span>0603</span><input type="number" value="36" /></label>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" data-debug-close type="button">Отмена</button>
            <button class="primary-button" data-debug-close type="button">${icon("save")}<span>Сохранить</span></button>
          </div>
        </section>
      </div>
    `;
  }

  return `
    <div class="modal-backdrop" data-debug-close>
      <section class="modal" role="dialog" aria-modal="true" aria-label="MOD-01 Confirm Compact">
        <div class="modal-header">
          <div>
            <span class="eyebrow">MOD-01 · Confirm Compact</span>
            <h2>Сбросить маршрут?</h2>
          </div>
          <button class="icon-button" data-debug-close type="button" title="Закрыть">${icon("close")}</button>
        </div>
        <p class="modal-copy">Маршрутная карта будет возвращена к шаблону проекта. Расчет BOM и спецификация останутся без изменений.</p>
        <div class="modal-footer">
          <button class="secondary-button" data-debug-close type="button">Отмена</button>
          <button class="primary-button" data-debug-close type="button">${icon("reset")}<span>Сбросить</span></button>
        </div>
      </section>
    </div>
  `;
}

function renderConfirmModal() {
  if (!ui.confirmDialog) return "";
  const config = getConfirmDialogConfig(ui.confirmDialog);

  return `
    <div class="modal-backdrop confirm-backdrop" data-confirm-cancel>
      <section class="modal confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeAttribute(config.title)}">
        <div class="modal-header">
          <div>
            <span class="eyebrow">MOD-01 · Confirm Compact</span>
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
      meta: "Это изменит план проекта и пересчитает отчеты.",
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
      meta: "Действие влияет на Gantt, предупреждения и отчеты.",
      confirmLabel: "Пересчитать",
      confirmIcon: "refresh",
      icon: "refresh",
      tone: "warning",
    };
  }

  if (dialog?.action === "scheduleAllBacklog") {
    const backlogCount = buildBacklogItems(240).length;
    return {
      title: "Запланировать всю очередь?",
      body: `${backlogCount} операций без слота будут автоматически размещены в ближайшие свободные окна по маршрутам и участкам.`,
      meta: "Действие меняет Gantt, складские операции, предупреждения и отчеты.",
      confirmLabel: "Запланировать",
      confirmIcon: "play",
      icon: "calendar",
      tone: "warning",
    };
  }

  if (dialog?.action === "fixAllWarnings") {
    const warnings = getSlotWarnings(planningState).warnings;
    const critical = warnings.filter((warning) => warning.severity === "critical").length;
    return {
      title: "Исправить конфликты плана?",
      body: `Система попробует автоматически исправить ${warnings.length} предупреждений, включая ${critical} критичных: сдвиги, пересечения, участки и количество.`,
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
      body: "Маршрутная карта калькулятора будет возвращена к шаблону проекта. Выбранная спецификация и BOM останутся.",
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
      meta: "После сохранения маршрута это может изменить маршрут проекта.",
      confirmLabel: "Удалить",
      confirmIcon: "trash",
      icon: "alert",
      tone: "danger",
    };
  }

  if (dialog?.action === "calculatorSaveRoute") {
    const calc = calculateComplexityResult();
    return {
      title: "Сохранить маршрут проекта?",
      body: `Маршрутная карта проекта "${calc.project?.name || "проект"}" будет обновлена по расчету калькулятора.`,
      meta: "Действие влияет на справочник маршрутов и будущую постановку операций на Gantt.",
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
      meta: slotsCount ? `Этот шаг используют ${slotsCount} операций Gantt. После удаления они получат предупреждение маршрута.` : "Действие изменит технологическую последовательность проекта.",
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

function renderReportChart(chart) {
  if (chart.type === "donut") {
    return `
      <article class="report-chart-card">
        <div class="report-card-head">
          <strong>${escapeHtml(chart.title)}</strong>
          <span>${escapeHtml(chart.caption)}</span>
        </div>
        <div class="donut-wrap">
          <div class="donut-chart" style="background:${buildDonutGradient(chart.items)};">
            <span>${escapeHtml(chart.center)}</span>
          </div>
          <div class="chart-legend">
            ${chart.items.map((item) => `
              <div><i style="background:${item.color};"></i><span>${escapeHtml(item.label)}</span><strong>${item.value}</strong></div>
            `).join("")}
          </div>
        </div>
      </article>
    `;
  }

  return `
    <article class="report-chart-card">
      <div class="report-card-head">
        <strong>${escapeHtml(chart.title)}</strong>
        <span>${escapeHtml(chart.caption)}</span>
      </div>
      <div class="bar-chart">
        ${chart.items.map((item) => `
          <div class="bar-row">
            <span>${escapeHtml(item.label)}</span>
            <div class="bar-track"><i style="width:${item.percent}%; background:${item.color};"></i></div>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderReportTable(table) {
  return `
    <section class="report-table-card">
      <div class="directory-table-toolbar">
        <strong>${escapeHtml(table.title)}</strong>
        <span>${escapeHtml(table.caption)}</span>
      </div>
      <div class="directory-table-wrap" data-layout="table">
        <table class="directory-table">
          <thead>
            <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${table.rows.map((row) => `
              <tr>${row.map((cell, index) => `<td class="${index === 0 ? "primary-cell" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function getReportData(reportId) {
  const warnings = getSlotWarnings(planningState).warnings;
  const slotHours = planningState.slots.reduce((sum, slot) => sum + getSlotDurationHours(slot), 0);
  const completedSlots = planningState.slots.filter((slot) => slot.status === "completed").length;
  const warehouseSlots = planningState.slots.filter((slot) => slot.workCenterId === "warehouse");
  const problemSlots = planningState.slots.filter((slot) => ["problem", "overdue"].includes(slot.status)).length;

  const baseKpis = [
    { label: "Проекты", value: String(planningState.projects.length), caption: "в производственном контуре" },
    { label: "Операции", value: String(planningState.slots.length), caption: "слотов в плане" },
    { label: "Плановые часы", value: formatReportNumber(slotHours), caption: "суммарная длительность" },
    { label: "Предупреждения", value: String(warnings.length), caption: "конфликты и маршруты" },
  ];

  if (reportId === "workload") {
    const workload = buildWorkloadRows();
    return {
      title: "Загрузка участков",
      description: "Сравнение количества операций и плановых часов по производственным участкам.",
      kpis: [
        { label: "Участки", value: String(planningState.workCenters.length), caption: "активные строки планирования" },
        { label: "Самый загруженный", value: workload[0]?.label || "-", caption: `${workload[0]?.hours || 0} ч в плане` },
        { label: "Склад", value: String(warehouseSlots.length), caption: "финальных операций" },
        { label: "Конфликты", value: String(warnings.filter((warning) => warning.type === "capacity").length), caption: "по емкости участков" },
      ],
      charts: [
        { type: "bar", title: "Плановые часы", caption: "по участкам", items: workload.map((row) => ({ label: row.label, value: `${row.hours} ч`, percent: row.percentHours, color: row.color })) },
        { type: "bar", title: "Количество операций", caption: "по участкам", items: workload.map((row) => ({ label: row.label, value: String(row.count), percent: row.percentCount, color: row.color })) },
      ],
      table: {
        title: "Детализация загрузки",
        caption: "операции, часы и количество изделий",
        columns: ["Участок", "Операций", "Плановые часы", "Изделий", "Доля"],
        rows: workload.map((row) => [row.label, String(row.count), `${row.hours} ч`, String(row.quantity), `${row.percentHours}%`]),
      },
      insightTitle: "Распределение мощности",
      insights: buildWorkloadInsights(workload, warnings),
    };
  }

  if (reportId === "deadlines") {
    const deadlineRows = buildDeadlineRows();
    return {
      title: "Сроки и отклонения",
      description: "Состояние проектов относительно сроков сдачи и рисков выполнения.",
      kpis: [
        { label: "В работе", value: String(planningState.projects.filter((project) => project.status === "in_progress").length), caption: "активные проекты" },
        { label: "Проблемные", value: String(planningState.projects.filter((project) => project.status === "problem").length), caption: "требуют внимания" },
        { label: "Ближайший срок", value: deadlineRows[0]?.due || "-", caption: deadlineRows[0]?.project || "нет данных" },
        { label: "Отклонения", value: String(problemSlots), caption: "операции problem/overdue" },
      ],
      charts: [
        { type: "bar", title: "Готовность проектов", caption: "расчет по завершенным операциям", items: deadlineRows.map((row) => ({ label: row.project, value: `${row.progress}%`, percent: row.progress, color: row.color })) },
        { type: "donut", title: "Статусы проектов", caption: "структура портфеля", center: `${planningState.projects.length}`, items: buildProjectStatusItems() },
      ],
      table: {
        title: "Проекты по срокам",
        caption: "сортировка по ближайшей дате сдачи",
        columns: ["Проект", "Заказ", "Срок", "Статус", "Готовность"],
        rows: deadlineRows.map((row) => [row.project, row.order, row.due, row.status, `${row.progress}%`]),
      },
      insightTitle: "Риски сроков",
      insights: buildDeadlineInsights(deadlineRows),
    };
  }

  if (reportId === "quality") {
    const warningRows = buildWarningRows(warnings);
    return {
      title: "Проблемы и конфликты",
      description: "Сводка предупреждений по загрузке участков, маршрутам и количествам.",
      kpis: [
        { label: "Всего", value: String(warnings.length), caption: "активных предупреждений" },
        { label: "Критичные", value: String(warnings.filter((warning) => warning.severity === "critical").length), caption: "нужна коррекция плана" },
        { label: "Маршруты", value: String(warnings.filter((warning) => warning.type === "route").length), caption: "последовательность операций" },
        { label: "Загрузка", value: String(warnings.filter((warning) => warning.type === "capacity").length), caption: "пересечения участков" },
      ],
      charts: [
        { type: "donut", title: "Типы предупреждений", caption: "по категориям", center: `${warnings.length}`, items: buildWarningTypeItems(warnings) },
        { type: "bar", title: "Предупреждения по проектам", caption: "количество сообщений", items: buildWarningProjectItems(warnings) },
      ],
      table: {
        title: "Список предупреждений",
        caption: "верхние записи текущего плана",
        columns: ["Тип", "Серьезность", "Проект", "Сообщение"],
        rows: warningRows,
      },
      insightTitle: "Контроль качества плана",
      insights: buildWarningInsights(warnings),
    };
  }

  if (reportId === "warehouse") {
    const rows = warehouseSlots.map((slot) => {
      const project = getProject(slot.projectId);
      const batch = getBatch(slot.batchId);
      return {
        project: project?.name || "-",
        batch: batch?.batchNumber || "-",
        quantity: slot.quantity,
        start: formatDateTime(slot.plannedStart),
        status: STATUS_LABELS[slot.status],
      };
    });
    const quantity = warehouseSlots.reduce((sum, slot) => sum + Number(slot.quantity || 0), 0);
    return {
      title: "Склад и выпуск",
      description: "Финальные складские операции, которые закрывают производственный маршрут.",
      kpis: [
        { label: "Складских операций", value: String(warehouseSlots.length), caption: "конечный этап маршрута" },
        { label: "Изделий к приемке", value: String(quantity), caption: "по складским слотам" },
        { label: "Завершено", value: String(warehouseSlots.filter((slot) => slot.status === "completed").length), caption: "принято на склад" },
        { label: "В плане", value: String(warehouseSlots.filter((slot) => slot.status === "planned").length), caption: "ожидает приемки" },
      ],
      charts: [
        { type: "bar", title: "Склад по проектам", caption: "количество изделий", items: buildWarehouseProjectItems(warehouseSlots) },
        { type: "donut", title: "Статусы склада", caption: "складские операции", center: `${warehouseSlots.length}`, items: buildSlotStatusItems(warehouseSlots) },
      ],
      table: {
        title: "Финальные операции",
        caption: "партии, которые завершают маршрут на складе",
        columns: ["Проект", "Партия", "Количество", "План", "Статус"],
        rows: rows.map((row) => [row.project, row.batch, String(row.quantity), row.start, row.status]),
      },
      insightTitle: "Выпуск продукции",
      insights: [
        { icon: "check", tone: "ok", text: "Склад выделен отдельным конечным этапом маршрута." },
        { icon: "info", text: "Салатово-зеленые слоты показывают операции финальной приемки." },
      ],
    };
  }

  return {
    title: "Сводка производства",
    description: "Обзор текущего производственного плана, статусов операций и выполнения проектов.",
    kpis: [
      ...baseKpis.slice(0, 3),
      { label: "Завершено", value: `${completedSlots}/${planningState.slots.length}`, caption: "операций закрыто" },
    ],
    charts: [
      { type: "donut", title: "Статусы операций", caption: "структура слотов", center: `${planningState.slots.length}`, items: buildSlotStatusItems(planningState.slots) },
      { type: "bar", title: "Прогресс проектов", caption: "по завершенным операциям", items: buildDeadlineRows().map((row) => ({ label: row.project, value: `${row.progress}%`, percent: row.progress, color: row.color })) },
    ],
    table: {
      title: "Производственный портфель",
      caption: "проекты, объемы, сроки и готовность",
      columns: ["Проект", "Заказ", "Количество", "Срок", "Статус", "Готовность"],
      rows: buildDeadlineRows().map((row) => [row.project, row.order, row.quantity, row.due, row.status, `${row.progress}%`]),
    },
    insightTitle: "Оперативная картина",
    insights: [
      { icon: "info", text: `В плане ${planningState.slots.length} операций на ${planningState.workCenters.length} участках.` },
      { icon: warnings.length ? "alert" : "check", tone: warnings.length ? "warning" : "ok", text: warnings.length ? `Есть ${warnings.length} предупреждений плана.` : "Критичных предупреждений не найдено." },
      { icon: "check", tone: "ok", text: `Складских конечных операций: ${warehouseSlots.length}.` },
    ],
  };
}

function buildWorkloadRows() {
  const rows = planningState.workCenters.map((center, index) => {
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
  return [...planningState.projects]
    .sort((left, right) => toDate(left.dueDate) - toDate(right.dueDate))
    .map((project, index) => {
      const progress = calculateProjectProgress(project, planningState);
      return {
        project: project.name,
        order: project.orderNumber,
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
  return PROJECT_STATUSES.map((status) => ({
    label: PROJECT_STATUS_LABELS[status],
    value: planningState.projects.filter((project) => project.status === status).length,
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
  const counts = planningState.projects.map((project, index) => {
    const value = warnings.filter((warning) => warning.projectId === project.id).length;
    return {
      label: project.name,
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
  const rows = planningState.projects.map((project, index) => {
    const quantity = warehouseSlots
      .filter((slot) => slot.projectId === project.id)
      .reduce((sum, slot) => sum + Number(slot.quantity || 0), 0);
    return {
      label: project.name,
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
    getProject(warning.projectId)?.name || "-",
    warning.message,
  ]);
}

function buildWorkloadInsights(workload, warnings) {
  const top = workload[0];
  return [
    { icon: "info", text: top ? `Самый загруженный участок: ${top.label}, ${top.hours} ч.` : "Нет операций для анализа загрузки." },
    { icon: warnings.some((warning) => warning.type === "capacity") ? "alert" : "check", tone: warnings.some((warning) => warning.type === "capacity") ? "warning" : "ok", text: warnings.some((warning) => warning.type === "capacity") ? "Есть пересечения операций на участках." : "Пересечений по емкости не найдено." },
    { icon: "check", tone: "ok", text: "Склад учитывается как отдельный конечный участок." },
  ];
}

function buildDeadlineInsights(deadlineRows) {
  const risky = deadlineRows.filter((row) => !row.status.includes("Заверш") && row.progress < 40);
  return [
    { icon: risky.length ? "alert" : "check", tone: risky.length ? "warning" : "ok", text: risky.length ? `${risky.length} проекта имеют низкую готовность.` : "Проекты выглядят устойчиво по готовности." },
    { icon: "info", text: deadlineRows[0] ? `Ближайший срок: ${deadlineRows[0].project}, ${deadlineRows[0].due}.` : "Нет проектов со сроками." },
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
    ...(directoryState.departments || []).map((department) => department.name),
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
        <strong>Конструктор отделов</strong>
        <span>перетаскивайте сотрудников между отделами, меняйте должность и роль доступа</span>
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
                        <span>Отдел</span>
                        ${renderEmployeeDenseSelect(employee.id, "department", employee.department, departmentOptions)}
                      </div>
                      <div class="field compact">
                        <span>Роль</span>
                        ${renderEmployeeDenseSelect(employee.id, "roleId", employee.roleId, roleOptions)}
                      </div>
                    </div>
                  </div>
                `).join("") : `
                  <div class="employee-drop-empty">Перетащите сотрудника в этот отдел</div>
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
  if (sectionId === "projects") {
    return makeDirectoryData(sectionId, {
      caption: "Проекты используются в плане производства и маршрутах партий.",
      columns: ["Проект", "Заказ", "Заказчик", "Кол-во", "Срок", "Статус"],
      keys: ["name", "orderNumber", "customer", "totalQuantity", "dueDate", "status"],
      rows: planningState.projects.map((project) => ({
        id: project.id,
        name: project.name,
        orderNumber: project.orderNumber,
        customer: project.customer || "-",
        totalQuantity: project.totalQuantity,
        dueDate: project.dueDate,
        status: project.status,
      })),
    });
  }

  if (sectionId === "workCenters") {
    return makeDirectoryData(sectionId, {
      caption: "Участки связывают операции маршрута с производственными строками Gantt.",
      columns: ["Участок", "Код", "Изд./час", "Емкость", "Смена", "Описание", "Активность"],
      keys: ["name", "code", "unitsPerHour", "capacity", "shift", "description", "status"],
      rows: planningState.workCenters.map((center) => ({
        id: center.id,
        name: center.name,
        code: center.code,
        unitsPerHour: center.unitsPerHour,
        capacity: center.capacity,
        shift: center.shift,
        description: center.description || "-",
        status: center.isActive ? "active" : "inactive",
      })),
    });
  }

  if (sectionId === "routes") {
    return makeDirectoryData(sectionId, {
      caption: "Маршруты задают последовательность операций для проектов.",
      columns: ["Маршрут", "Проект", "Шагов", "По умолчанию"],
      keys: ["name", "project", "steps", "default"],
      rows: planningState.routes.map((route) => ({
        id: route.id,
        name: route.name,
        project: getProject(route.projectId)?.name || "-",
        steps: getProjectRouteSteps(route.projectId, planningState).length,
        default: route.isDefault ? "yes" : "no",
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
    specifications: {
      caption: "Спецификация отвечает на вопрос, из чего собирается проект: BOM смонтированных плат плюс дополнительные узлы.",
      columns: ["Спецификация", "Проект", "Рев.", "Итоговое изделие", "BOM A", "Кол-во A", "BOM B", "Кол-во B", "Доп. состав", "Статус"],
      keys: ["name", "projectId", "revision", "outputItem", "bomListA", "bomQtyA", "bomListB", "bomQtyB", "extraItems", "status"],
      rows: directoryState.specifications,
    },
    bomLists: {
      caption: "BOM-лист описывает компонентный состав результата SMT: смонтированной печатной платы.",
      columns: ["BOM", "Проект", "Плата", "Рев.", "Результат", ...BOM_COMPONENT_FIELDS.map((field) => field.label), "Статус"],
      keys: ["name", "projectId", "boardCode", "revision", "resultItem", ...BOM_COMPONENT_FIELDS.map((field) => field.key), "status"],
      rows: directoryState.bomLists,
    },
    departments: {
      caption: "Организационная структура для ответственности и прав доступа.",
      columns: ["Отдел", "Код", "Ответственный", "Статус"],
      keys: ["name", "code", "owner", "status"],
      rows: directoryState.departments,
    },
    roles: {
      caption: "Роли управляют доступом к модулям, справочникам и действиям пользователя.",
      columns: ["Роль", "Код", "Уровень", "Модули", "Справочники", "Права", "Статус"],
      keys: ["name", "code", "accessLevel", "modules", "directories", "permissions", "status"],
      rows: directoryState.roles,
    },
    resources: {
      caption: "Ресурсы используются калькулятором сложности и могут назначаться на операции.",
      columns: ["Ресурс", "Тип", "Участок", "Мощность", "База комп./ч", "Эфф., %", "Setup, мин", "Статус"],
      keys: ["name", "type", "workCenter", "capacity", "baseCph", "efficiency", "changeoverMin", "status"],
      rows: directoryState.resources,
    },
    componentTypes: {
      caption: "Коэффициенты сложности и ограничения скорости для расчета SMT-монтажа.",
      columns: ["Тип", "Корпус", "Семейство", "Коэф.", "Комп./ч", "Setup, сек", "По умолч.", "Статус"],
      keys: ["name", "package", "family", "coefficient", "placementsPerHour", "setupSeconds", "defaultCount", "status"],
      rows: directoryState.componentTypes,
    },
    employees: {
      caption: "Сотрудники получают роли доступа из справочника ролей и используются для авторизации по ФИО.",
      columns: ["Сотрудник", "Роль доступа", "Должность", "Отдел", "Смена", "Пароль", "Статус"],
      keys: ["name", "roleId", "role", "department", "shift", "password", "status"],
      rows: directoryState.employees,
    },
    equipment: {
      caption: "Оборудование связывается с участками, ресурсами и обслуживанием.",
      columns: ["Оборудование", "Инв. номер", "Участок", "ТО", "Статус"],
      keys: ["name", "inventory", "workCenter", "maintenance", "status"],
      rows: directoryState.equipment,
    },
    norms: {
      caption: "Нормативы используются для ограничений, смен и будущего автопланирования.",
      columns: ["Норматив", "Значение", "Область", "Статус"],
      keys: ["name", "value", "scope", "status"],
      rows: directoryState.norms,
    },
  };

  return makeDirectoryData(sectionId, configs[sectionId] || configs.departments);
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
  if (sectionId === "specifications" && key === "projectId") return "project-link";
  if (sectionId === "bomLists" && key === "projectId") return "project-link";
  if (sectionId === "specifications" && (key === "bomListA" || key === "bomListB")) return "bom-link";
  if (sectionId === "employees" && key === "roleId") return "role-link";
  if (sectionId === "employees" && key === "password") return "password";
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
  if (key === "status" && sectionId === "projects") return "project-status";
  if (key === "status" && sectionId === "workCenters") return "active-status";
  if (key === "default") return "yes-no";
  return "text";
}

function isDirectoryFieldReadonly(sectionId, key) {
  return sectionId === "routes" && key === "steps";
}

function getSelectedDirectoryRowIndex(sectionId, rows) {
  const index = Number(ui.selectedDirectoryRows?.[sectionId] || 0);
  if (!rows.length) return 0;
  return Math.max(0, Math.min(rows.length - 1, Number.isFinite(index) ? index : 0));
}

function formatDirectoryCell(sectionId, key, value) {
  if (sectionId === "projects" && key === "status") return PROJECT_STATUS_LABELS[value] || value;
  if (sectionId === "projects" && key === "dueDate") return value ? formatDate(value) : "-";
  if (sectionId === "projects" && key === "totalQuantity") return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (sectionId === "workCenters" && key === "status") return value === "active" ? "Активен" : "Отключен";
  if (sectionId === "workCenters" && key === "unitsPerHour") return `${Number(value || 0).toLocaleString("ru-RU")} изд./час`;
  if (sectionId === "workCenters" && key === "capacity") return `${Number(value || 1).toLocaleString("ru-RU")} паралл.`;
  if (sectionId === "specifications" && key === "projectId") return getProject(value)?.name || "-";
  if (sectionId === "bomLists" && key === "projectId") return getProject(value)?.name || "-";
  if (sectionId === "specifications" && (key === "bomListA" || key === "bomListB")) return getBomList(value)?.name || "-";
  if (sectionId === "specifications" && (key === "bomQtyA" || key === "bomQtyB")) return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (sectionId === "bomLists" && BOM_COMPONENT_FIELDS.some((field) => field.key === key)) return `${Number(value || 0).toLocaleString("ru-RU")} шт.`;
  if (sectionId === "resources" && key === "baseCph") return Number(value || 0) ? `${Number(value || 0).toLocaleString("ru-RU")} комп./ч` : "-";
  if (sectionId === "resources" && key === "efficiency") return `${Number(value || 0).toLocaleString("ru-RU")} %`;
  if (sectionId === "resources" && key === "changeoverMin") return `${Number(value || 0).toLocaleString("ru-RU")} мин`;
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
              <span class="eyebrow">MOD-02 · Form Modal · ${escapeHtml(activeSection.label)}</span>
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

  if (field.type === "project-status") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}" ${field.readonly ? "disabled" : ""}>
          ${PROJECT_STATUSES.map((status) => `<option value="${status}" ${selected(value, status)}>${PROJECT_STATUS_LABELS[status]}</option>`).join("")}
        </select>
      </label>
    `;
  }

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

  if (field.type === "project-link") {
    return `
      <label class="form-field command-field">
        <span>${escapeHtml(field.label)}</span>
        <select name="${field.key}">
          ${planningState.projects.map((project) => `<option value="${project.id}" ${selected(value, project.id)}>${escapeHtml(project.name)}</option>`).join("")}
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
    if (key === "status") row[key] = directoryData.sectionId === "projects" ? "planned" : "Активен";
    if (directoryData.sectionId === "workCenters" && key === "status") row[key] = "active";
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
    if (key === "projectId") row[key] = planningState.projects[0]?.id || "";
    if (key === "bomListA") row[key] = directoryState.bomLists?.[0]?.id || "";
    if (key === "bomListB") row[key] = "";
    if (key === "bomQtyA") row[key] = 1;
    if (key === "bomQtyB") row[key] = 0;
    if (key === "shift") row[key] = "08:00-20:00";
    if (key === "roleId") row[key] = directoryState.roles?.[0]?.id || "role-admin";
    if (key === "password") row[key] = "";
    if (directoryData.sectionId === "roles" && key === "modules") row[key] = "reports";
    if (directoryData.sectionId === "roles" && key === "directories") row[key] = "projects, statuses";
    if (directoryData.sectionId === "roles" && key === "permissions") row[key] = "read";
    if (key === "default") row[key] = "no";
    if (key === "dueDate") row[key] = toDateInput(addMs(new Date(), 14 * 24 * 60 * 60 * 1000));
    if (directoryData.sectionId === "routes" && key === "project") row[key] = planningState.projects[0]?.name || "";
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
    const employee = (directoryState.employees || []).find((item) => item.id === String(data.get("employeeId")));
    const password = String(data.get("password") || "");
    const expectedPassword = String(employee?.password || "");

    if (!employee) {
      alert("Выберите сотрудника для входа.");
      return;
    }

    if (password !== expectedPassword) {
      alert("Пароль не совпадает. Для MVP пароль у всех сотрудников пустой.");
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
  ui.activeModule = moduleId;
  ui.selectedSlotId = null;
  ui.editor = null;
  ui.splitSlotId = null;
  ui.projectModal = false;
  ui.debugOverlay = null;
  ui.confirmDialog = null;
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

  if (dialog.action === "cascadeSlot") {
    cascadeBatchFromSlot(payload.slotId);
    persistState();
    render();
    return;
  }

  if (dialog.action === "scheduleAllBacklog") {
    scheduleAllBacklog();
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
  }
}

function bindDebugEvents() {
  app.querySelectorAll("[data-debug-overlay]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.debugOverlay = button.dataset.debugOverlay;
      render();
    });
  });

  app.querySelectorAll("[data-debug-close]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("button")) return;
      ui.debugOverlay = null;
      render();
    });
  });

  let draggedSpecNode = null;
  const addSpecNodeToCanvas = (node) => {
    if (!node?.title) return;
    const zone = app.querySelector("[data-spec-drop-zone]");
    const item = document.createElement("div");
    item.className = "spec-stack-item is-new";
    item.innerHTML = `<span>1x</span><strong>${escapeHtml(node.title)}</strong><em>${escapeHtml(node.type || "Item")} · добавлено</em>`;
    zone?.closest(".spec-drop-canvas")?.append(item);
  };

  app.querySelectorAll("[data-spec-palette-card]").forEach((card) => {
    card.addEventListener("click", () => {
      addSpecNodeToCanvas({
        title: card.dataset.specTitle || "Новый узел",
        type: card.dataset.specType || "Item",
      });
    });

    card.addEventListener("dragstart", (event) => {
      draggedSpecNode = {
        title: card.dataset.specTitle || "Новый узел",
        type: card.dataset.specType || "Item",
      };
      card.classList.add("is-being-dragged");
      event.dataTransfer?.setData("text/plain", JSON.stringify(draggedSpecNode));
      event.dataTransfer?.setDragImage(card, 16, 16);
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("is-being-dragged");
      app.querySelectorAll("[data-spec-drop-zone]").forEach((zone) => zone.classList.remove("is-drop-ready"));
      draggedSpecNode = null;
    });
  });

  app.querySelectorAll("[data-spec-drop-zone]").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("is-drop-ready");
    });

    zone.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && zone.contains(event.relatedTarget)) return;
      zone.classList.remove("is-drop-ready");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("is-drop-ready");
      const rawData = event.dataTransfer?.getData("text/plain");
      let dropped = draggedSpecNode;
      try {
        dropped = rawData ? JSON.parse(rawData) : draggedSpecNode;
      } catch {
        dropped = draggedSpecNode;
      }
      addSpecNodeToCanvas(dropped);
    });
  });
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
      if (event.target.closest("[data-edit-directory-row]")) return;
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
  directoryState = normalizeDirectoryState(directoryState);
  ensureAuthorizedModule();
  persistDirectoryState();
  persistUiState();
  render();
}

function bindReportEvents() {
  app.querySelectorAll("[data-report-id]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.activeReport = button.dataset.reportId;
      persistUiState();
      render();
    });
  });

  app.querySelector("[data-report-refresh]")?.addEventListener("click", () => {
    render();
  });
}

function bindProjectsEvents() {
  app.querySelector("[data-project-create]")?.addEventListener("click", () => {
    ui.activeProjectId = "__new__";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-project-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const projectId = button.dataset.projectOpen;
      const specification = getProjectSpecification(projectId);
      const bom = (directoryState.bomLists || []).find((item) => item.projectId === projectId);
      ui.activeProjectId = projectId;
      ui.activeSpecificationId = specification?.id || ui.activeSpecificationId || "";
      ui.activeBomId = bom?.id || ui.activeBomId || "";
      persistUiState();
      render();
    });
  });

  app.querySelectorAll("[data-project-status-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const root = button.closest("[data-project-status-group]");
      const input = app.querySelector("[data-project-status-input]");
      if (!root || !input) return;
      root.querySelectorAll("[data-project-status-option]").forEach((item) => item.classList.toggle("is-active", item === button));
      input.value = button.dataset.projectStatusOption || "planned";
    });
  });

  app.querySelector("#projectModuleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProjectModuleForm(event.currentTarget);
  });

  app.querySelectorAll("[data-project-to-calculator]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = getActiveProjectForModule();
      if (!project) return;
      openProjectInCalculator(project.id);
    });
  });

  app.querySelectorAll("[data-project-to-planning]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = getActiveProjectForModule();
      if (!project) return;
      ui.activeModule = "planning";
      persistUiState();
      focusProject(project.id);
    });
  });

  app.querySelector("[data-open-project-specification]")?.addEventListener("click", () => {
    const project = getActiveProjectForModule();
    if (!project) return;
    const specification = getProjectSpecification(project.id);
    ui.activeModule = "specifications";
    ui.activeProjectId = project.id;
    ui.activeSpecificationId = specification?.id || "__new__";
    ui.activeBomId = specification?.bomListA || (directoryState.bomLists || []).find((bom) => bom.projectId === project.id)?.id || "";
    persistUiState();
    render();
  });

  app.querySelector("[data-open-project-boms]")?.addEventListener("click", () => {
    const project = getActiveProjectForModule();
    if (!project) return;
    ui.activeModule = "bomLists";
    ui.activeProjectId = project.id;
    ui.activeBomId = (directoryState.bomLists || []).find((bom) => bom.projectId === project.id)?.id || "__new__";
    persistUiState();
    render();
  });

  app.querySelector("[data-open-project-route]")?.addEventListener("click", () => {
    const project = getActiveProjectForModule();
    if (!project) return;
    const route = getProjectRouteForModule(project.id);
    ui.activeModule = "routes";
    ui.activeProjectId = project.id;
    ui.activeRouteId = route?.id || "__new__";
    persistUiState();
    render();
  });
}

function bindRoutesEvents() {
  app.querySelector("[data-route-create]")?.addEventListener("click", () => {
    ui.activeRouteId = "__new__";
    ui.activeProjectId = ui.activeProjectId || planningState.projects[0]?.id || "";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-route-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = planningState.routes.find((item) => item.id === button.dataset.routeOpen);
      if (!route) return;
      ui.activeRouteId = route.id;
      ui.activeProjectId = route.projectId;
      persistUiState();
      render();
    });
  });

  app.querySelector("#routeModuleForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveRouteModuleForm(event.currentTarget);
  });

  app.querySelectorAll("[data-dense-route-field] [data-dense-value]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const root = button.closest("[data-dense-route-field]");
      if (!root || root.dataset.denseRouteField !== "projectId") return;
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

  app.querySelectorAll("[data-route-step-required]").forEach((field) => {
    field.addEventListener("change", () => {
      updateRouteStepField(field.dataset.routeStepRequired, "isRequired", field.checked);
    });
  });

  app.querySelector("[data-route-add-step]")?.addEventListener("click", () => {
    addRouteModuleStep();
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

  app.querySelector("[data-route-to-project]")?.addEventListener("click", () => {
    const route = getActiveRouteForModule();
    if (!route) return;
    ui.activeModule = "projects";
    ui.activeProjectId = route.projectId;
    persistUiState();
    render();
  });

  app.querySelector("[data-route-to-calculator]")?.addEventListener("click", () => {
    const route = getActiveRouteForModule();
    if (!route) return;
    openProjectInCalculator(route.projectId);
  });

  app.querySelector("[data-route-to-planning]")?.addEventListener("click", () => {
    const route = getActiveRouteForModule();
    if (!route) return;
    ui.activeModule = "planning";
    ui.activeProjectId = route.projectId;
    persistUiState();
    focusProject(route.projectId);
  });
}

function saveRouteModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const existingRoute = getActiveRouteForModule();
  const projectId = existingRoute?.projectId || ui.activeProjectId || planningState.projects[0]?.id || "";
  const name = String(data.get("name") || "").trim();
  const isDefault = data.get("isDefault") === "on";
  if (!name || !projectId) {
    alert("Заполните название маршрутной карты и проект.");
    return;
  }

  const stamp = new Date().toISOString();
  const routeId = isNew ? makeId("r") : existingRoute?.id || String(data.get("routeId") || makeId("r"));
  const nextRoute = {
    ...(existingRoute || {}),
    id: routeId,
    projectId,
    name,
    isDefault,
    updatedAt: stamp,
  };

  planningState.routes = [
    ...planningState.routes
      .filter((route) => route.id !== routeId)
      .map((route) => route.projectId === projectId && isDefault ? { ...route, isDefault: false } : route),
    nextRoute,
  ];
  planningState = normalizePlanningState(planningState);
  ui.activeRouteId = routeId;
  ui.activeProjectId = projectId;
  persistState();
  persistUiState();
  render();
}

function updateRouteProject(projectId) {
  if (!projectId) return;
  const activeRoute = getActiveRouteForModule();
  if (!activeRoute || ui.activeRouteId === "__new__") {
    ui.activeProjectId = projectId;
    persistUiState();
    render();
    return;
  }

  planningState.routes = planningState.routes.map((route) => (
    route.id === activeRoute.id
      ? { ...route, projectId, updatedAt: new Date().toISOString() }
      : activeRoute.isDefault && route.projectId === projectId
        ? { ...route, isDefault: false }
      : route
  ));
  ui.activeProjectId = projectId;
  persistState();
  persistUiState();
  render();
}

function updateRouteStepField(stepId, field, rawValue) {
  const step = planningState.routeSteps.find((item) => item.id === stepId);
  if (!step || !field) return;
  const oldCenter = getWorkCenter(step.workCenterId);
  let value = rawValue;
  if (["stepOrder", "setupMin", "secondsPerPanel"].includes(field)) {
    value = Math.max(field === "stepOrder" ? 1 : 0, Math.round(Number(rawValue || 0)));
  }
  if (field === "unitsPerHour") {
    value = Math.max(0, Math.round(Number(rawValue || 0) * 10) / 10);
  }

  planningState.routeSteps = planningState.routeSteps.map((item) => {
    if (item.id !== stepId) return item;
    const next = { ...item, [field]: value, updatedAt: new Date().toISOString() };
    if (field === "workCenterId") {
      const center = getWorkCenter(value);
      const shouldRename = !item.operationName || item.operationName === oldCenter?.name || item.operationName === oldCenter?.code;
      next.operationName = shouldRename ? center?.name || "Операция" : item.operationName;
      if (!Number(next.unitsPerHour || 0)) next.unitsPerHour = getWorkCenterUnitsPerHour(value);
    }
    return next;
  });

  if (field === "stepOrder") normalizeRouteStepOrders(step.routeId);
  persistState();
  render();
}

function addRouteModuleStep() {
  const route = getActiveRouteForModule();
  if (!route) return;
  const steps = getRouteStepsForModule(route.id);
  const warehouseStep = steps.find((step) => step.workCenterId === "warehouse");
  const insertOrder = warehouseStep?.stepOrder || Math.max(0, ...steps.map((step) => Number(step.stepOrder || 0))) + 1;
  const workCenterId = planningState.workCenters.find((center) => center.id !== "warehouse")?.id || "manual";
  const center = getWorkCenter(workCenterId);

  planningState.routeSteps = [
    ...planningState.routeSteps.map((step) => (
      step.routeId === route.id && Number(step.stepOrder || 0) >= insertOrder
        ? { ...step, stepOrder: Number(step.stepOrder || 0) + 1 }
        : step
    )),
    {
      id: makeId("rs"),
      routeId: route.id,
      workCenterId,
      operationName: center?.name || "Новая операция",
      stepOrder: insertOrder,
      isRequired: true,
      unitsPerHour: getWorkCenterUnitsPerHour(workCenterId),
      setupMin: 0,
      updatedAt: new Date().toISOString(),
    },
  ];
  normalizeRouteStepOrders(route.id);
  persistState();
  render();
}

function moveRouteStep(stepId, direction) {
  const step = planningState.routeSteps.find((item) => item.id === stepId);
  if (!step) return;
  const steps = getRouteStepsForModule(step.routeId);
  const index = steps.findIndex((item) => item.id === stepId);
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
  render();
}

function normalizeRouteStepOrders(routeId) {
  const orderedIds = getRouteStepsForModule(routeId).map((step) => step.id);
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
  const steps = getRouteStepsForModule(routeId);
  if (steps.length <= 1) {
    alert("В маршрутной карте должна остаться хотя бы одна операция.");
    return;
  }
  planningState.routeSteps = planningState.routeSteps.filter((item) => item.id !== stepId);
  normalizeRouteStepOrders(routeId);
  persistState();
  render();
}

function saveProjectModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const name = String(data.get("name") || "").trim();
  const orderNumber = String(data.get("orderNumber") || "").trim();
  const totalQuantity = normalizeOptionalPositiveInteger(data.get("totalQuantity"));
  if (!name || !orderNumber || !totalQuantity) {
    alert("Заполните название проекта, номер заказа и количество изделий.");
    return;
  }

  const stamp = new Date().toISOString();
  if (isNew) {
    const bundle = createProjectBundle({
      name,
      orderNumber,
      customer: String(data.get("customer") || "").trim(),
      totalQuantity,
      dueDate: String(data.get("dueDate") || toDateInput(addMs(new Date(), 14 * 24 * 60 * 60 * 1000))),
      status: PROJECT_STATUSES.includes(data.get("status")) ? data.get("status") : "planned",
      routeTemplate: String(data.get("routeTemplate") || "full"),
    });
    planningState.projects = [...planningState.projects, bundle.project];
    planningState.batches = [...planningState.batches, bundle.batch];
    planningState.routes = [...planningState.routes, bundle.route];
    planningState.routeSteps = [...planningState.routeSteps, ...bundle.routeSteps];
    planningState = normalizePlanningState(planningState);
    ui.activeProjectId = bundle.project.id;
  } else {
    const projectId = String(data.get("projectId") || "");
    planningState.projects = planningState.projects.map((project) => project.id === projectId ? {
      ...project,
      name,
      orderNumber,
      customer: String(data.get("customer") || "").trim(),
      totalQuantity,
      dueDate: String(data.get("dueDate") || project.dueDate),
      status: PROJECT_STATUSES.includes(data.get("status")) ? data.get("status") : project.status,
      updatedAt: stamp,
    } : project);
    ui.activeProjectId = projectId;
  }

  persistState();
  persistUiState();
  render();
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

  app.querySelector("[data-specification-to-calculator]")?.addEventListener("click", () => {
    const specification = getActiveSpecificationForModule();
    if (!specification) return;
    openProjectInCalculator(specification.projectId, specification.id);
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

  app.querySelector("[data-bom-import-file]")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const projectId = app.querySelector("#bomImportProjectId")?.value || getActiveProjectForModule()?.id || planningState.projects[0]?.id || "";
    if (!projectId) {
      alert("Перед импортом BOM выберите проект.");
      event.target.value = "";
      return;
    }

    try {
      await importBomFromXlsxFile(file, projectId);
      render();
    } catch (error) {
      alert(error?.message || "Не удалось импортировать BOM из Excel.");
    } finally {
      event.target.value = "";
    }
  });

  app.querySelector("[data-bom-to-calculator]")?.addEventListener("click", () => {
    const bom = getActiveBomForModule();
    if (!bom) return;
    calculatorState = normalizeCalculatorState({
      ...calculatorState,
      projectId: bom.projectId,
      specificationId: "",
      noSpecification: true,
      bomListId: bom.id,
      componentCounts: getBomComponentCounts(bom),
    });
    persistCalculatorState();
    ui.activeModule = "calculator";
    ui.calculatorStep = "inputs";
    ui.activeProjectId = bom.projectId;
    persistUiState();
    render();
  });

  app.querySelector("[data-bom-to-specifications]")?.addEventListener("click", () => {
    const bom = getActiveBomForModule();
    if (!bom) return;
    const linkedSpecification = getBomLinkedSpecifications(bom.id)[0]
      || (directoryState.specifications || []).find((specification) => specification.projectId === bom.projectId);
    ui.activeModule = "specifications";
    ui.activeProjectId = bom.projectId;
    ui.activeSpecificationId = linkedSpecification?.id || "__new__";
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-bom-linked-spec]").forEach((button) => {
    button.addEventListener("click", () => {
      const specification = (directoryState.specifications || []).find((item) => item.id === button.dataset.bomLinkedSpec);
      if (!specification) return;
      ui.activeModule = "specifications";
      ui.activeProjectId = specification.projectId;
      ui.activeSpecificationId = specification.id;
      persistUiState();
      render();
    });
  });
}

function saveSpecificationModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const id = isNew ? makeId("spec") : String(data.get("specificationId") || makeId("spec"));
  const name = String(data.get("name") || "").trim();
  const projectId = String(data.get("projectId") || "");
  if (!name || !projectId) {
    alert("Заполните название спецификации и проект.");
    return;
  }

  const row = {
    id,
    name,
    projectId,
    revision: String(data.get("revision") || "A").trim(),
    outputItem: String(data.get("outputItem") || "").trim(),
    bomListA: String(data.get("bomListA") || ""),
    bomQtyA: Math.max(0, Number(data.get("bomQtyA") || 0)),
    bomListB: String(data.get("bomListB") || ""),
    bomQtyB: Math.max(0, Number(data.get("bomQtyB") || 0)),
    extraItems: String(data.get("extraItems") || "").trim(),
    status: String(data.get("status") || "Черновик").trim(),
    updatedAt: new Date().toISOString(),
  };

  directoryState.specifications = isNew
    ? [...(directoryState.specifications || []), row]
    : (directoryState.specifications || []).map((item) => item.id === id ? { ...item, ...row } : item);
  directoryState = normalizeDirectoryState(directoryState);
  ui.activeSpecificationId = id;
  ui.activeProjectId = projectId;
  if (row.bomListA) ui.activeBomId = row.bomListA;
  persistDirectoryState();
  persistUiState();
  render();
}

function saveBomModuleForm(form) {
  const data = new FormData(form);
  const isNew = data.get("isNew") === "yes";
  const id = isNew ? makeId("bom") : String(data.get("bomId") || makeId("bom"));
  const previousBom = getBomList(id);
  const name = String(data.get("name") || "").trim();
  const projectId = String(data.get("projectId") || "");
  if (!name || !projectId) {
    alert("Заполните название BOM и проект.");
    return;
  }

  const row = {
    id,
    name,
    projectId,
    boardCode: String(data.get("boardCode") || "").trim(),
    revision: String(data.get("revision") || "A.0").trim(),
    resultItem: String(data.get("resultItem") || "").trim(),
    status: String(data.get("status") || "Черновик").trim(),
    importHeaders: previousBom?.importHeaders || [],
    importRows: previousBom?.importRows || [],
    importedAt: previousBom?.importedAt || "",
    sourceFileName: previousBom?.sourceFileName || "",
    sourceSheetName: previousBom?.sourceSheetName || "",
    updatedAt: new Date().toISOString(),
  };
  for (const field of BOM_COMPONENT_FIELDS) {
    row[field.key] = Math.max(0, Number(data.get(field.key) || 0));
  }

  directoryState.bomLists = isNew
    ? [...(directoryState.bomLists || []), row]
    : (directoryState.bomLists || []).map((item) => item.id === id ? { ...item, ...row } : item);

  const attachToSpecificationId = String(data.get("attachToSpecificationId") || "");
  const activeSpecification = attachToSpecificationId
    ? (directoryState.specifications || []).find((specification) => specification.id === attachToSpecificationId)
    : null;
  if (isNew && activeSpecification && activeSpecification.projectId === projectId && !activeSpecification.bomListA) {
    directoryState.specifications = (directoryState.specifications || []).map((specification) => (
      specification.id === activeSpecification.id
        ? { ...specification, bomListA: id, bomQtyA: 1, updatedAt: row.updatedAt }
        : specification
    ));
    ui.activeSpecificationId = activeSpecification.id;
  }

  directoryState = normalizeDirectoryState(directoryState);
  ui.activeBomId = id;
  ui.activeProjectId = projectId;
  persistDirectoryState();
  persistUiState();
  render();
}

function openProjectInCalculator(projectId, specificationId = "") {
  const project = planningState.projects.find((item) => item.id === projectId);
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
        createCalculatorSpecification();
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
      loadCalculatorProjectBinding(button.dataset.loadCalculatorProject);
    });
  });

  app.querySelectorAll("[data-close-modal], [data-modal-backdrop]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target !== element && !element.matches("[data-close-modal]")) return;
      ui.projectModal = false;
      render();
    });
  });

  bindProjectForm();
}

function applySpecificationBomsToComponentOperations() {
  const operations = getRouteOperations();
  const selectedBom = getBomList(calculatorState.bomListId);
  const bomEntries = calculatorState.noSpecification && selectedBom
    ? [{ bom: selectedBom, quantity: 1, slot: "PCB" }]
    : getSpecificationBomEntries(calculatorState.specificationId);
  const fallbackBom = selectedBom || bomEntries[0]?.bom || null;
  const nextCounts = { ...(calculatorState.componentCountsByOperation || {}) };

  operations
    .filter((operation) => operation.calculationType === "components")
    .forEach((operation) => {
      const bom = getBomList(operation.bomListId) || fallbackBom;
      if (!bom) return;
      nextCounts[operation.id] = getBomComponentCounts(bom);
    });

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
    alert("Сначала выберите или создайте проект.");
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
    revision: "A",
    outputItem: project.name,
    bomListA: bom?.id || "",
    bomQtyA: bom ? 1 : 0,
    bomListB: "",
    bomQtyB: 0,
    extraItems: "",
    status: "Черновик",
  };

  directoryState.specifications = [...(directoryState.specifications || []), specification];
  directoryState = normalizeDirectoryState(directoryState);
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
    alert("Заполните проект, режим спецификации, BOM и количество перед сохранением входных данных.");
    return;
  }

  const stamp = new Date().toISOString();
  if (calc.bomList && calc.project) {
    directoryState.bomLists = (directoryState.bomLists || []).map((bom) => (
      bom.id === calc.bomList.id ? { ...bom, projectId: calc.project.id, updatedAt: stamp } : bom
    ));
    directoryState = normalizeDirectoryState(directoryState);
    persistDirectoryState();
  }

  calculatorState.inputsSavedAt = stamp;
  calculatorState.lastSavedAt = "";
  calculatorState = normalizeCalculatorState(calculatorState);
  persistCalculatorState();
  render();
}

function getNextCalculatorStep() {
  const calc = calculateComplexityResult();
  const workflow = getCalculatorWorkflow(calc);
  return workflow.find((step) => !step.complete && !step.locked)?.id || workflow[workflow.length - 1]?.id || "inputs";
}

function buildCalculatorRouteFromTemplate() {
  if (!isCalculatorInputsComplete()) {
    alert("Заполните проект, спецификацию или режим без спецификации, BOM, количество плат и плат в мультипликации перед формированием маршрута.");
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

function loadCalculatorProjectBinding(projectId) {
  const project = planningState.projects.find((item) => item.id === projectId);
  if (!project) return;
  const specification = getProjectSpecification(project.id);
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
  app.querySelector("[data-calculator-build-route]")?.toggleAttribute("disabled", !inputComplete);
  app.querySelector("[data-save-calculator-inputs]")?.toggleAttribute("disabled", !inputComplete);
  app.querySelector("[data-add-route-operation]")?.toggleAttribute("disabled", !inputComplete);
  app.querySelector("[data-calculator-reset]")?.toggleAttribute("disabled", !routeReady);
  app.querySelectorAll("[data-calculator-save-route]").forEach((button) => {
    button.toggleAttribute("disabled", !routeReady);
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
      next.calculationType = value === "smt" ? "components" : "manual";
      next.secondsPerPanel = getDefaultSecondsPerPanel(value, calculatorState.boardsPerPanel);
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
  let route = planningState.routes.find((item) => item.projectId === calc.project.id && item.isDefault)
    || planningState.routes.find((item) => item.projectId === calc.project.id);

  if (!route) {
    route = {
      id: makeId("r"),
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
    ? { ...item, name: "Маршрутная карта", isDefault: true, updatedAt: stamp }
    : item);
  planningState.slots = planningState.slots.map((slot) => (
    slot.projectId === calc.project.id && !nextStepIds.has(slot.routeStepId) && routeStepIdsByWorkCenter.has(slot.workCenterId)
      ? { ...slot, routeStepId: routeStepIdsByWorkCenter.get(slot.workCenterId) }
      : slot
  ));
  calculatorState.lastSavedAt = stamp;
  ui.calculatorStep = "save";
  persistState();
  persistCalculatorState();
  persistUiState();
  render();
}

function applyCalculatorRateToWorkCenter() {
  const calc = calculateComplexityResult();
  const unitsPerHour = Math.max(1, Math.round(calc.flowBoardsPerHour));
  if (!calc.workCenter || !unitsPerHour) {
    alert("Не удалось рассчитать скорость участка: проверьте состав платы и ресурс.");
    return;
  }

  planningState.workCenters = planningState.workCenters.map((center) => center.id === calc.workCenter.id
    ? { ...center, unitsPerHour, updatedAt: new Date().toISOString() }
    : center);
  planningState.slots = planningState.slots.map((slot) => slot.workCenterId === calc.workCenter.id
    ? recalculateSlotEndByQuantity(slot, planningState)
    : slot);
  persistState();
  alert(`Норматив участка "${calc.workCenter.name}" обновлен: ${unitsPerHour.toLocaleString("ru-RU")} плат/час.`);
  render();
}

function applyCalculatorToProjectSlots() {
  const calc = calculateComplexityResult();
  if (!calc.project || !calc.workCenter || calc.perBoardSeconds <= 0) {
    alert("Не удалось применить расчет: выберите проект, участок и заполните состав платы.");
    return;
  }

  const targetSlots = planningState.slots.filter((slot) => (
    slot.projectId === calc.project.id
    && slot.workCenterId === calc.workCenter.id
    && slot.status !== "completed"
    && !slot.locked
  ));

  if (!targetSlots.length) {
    alert(`В проекте "${calc.project.name}" нет доступных операций участка "${calc.workCenter.name}".`);
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
  alert(`Расчет применен к ${targetSlots.length} операциям проекта "${calc.project.name}".`);
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
  if (sectionId === "projects") {
    saveProjectDirectoryRow(rowIndex, row);
    persistState();
    return;
  }

  if (sectionId === "workCenters") {
    saveWorkCenterDirectoryRow(rowIndex, row);
    persistState();
    return;
  }

  if (sectionId === "routes") {
    saveRouteDirectoryRow(rowIndex, row);
    persistState();
    return;
  }

  const rows = directoryState[sectionId] || [];
  const normalizedRow = normalizeDirectoryRow(sectionId, { ...row, id: row.id || makeId(sectionId.slice(0, 3) || "dir") });
  directoryState = {
    ...directoryState,
    [sectionId]: rowIndex >= 0
      ? rows.map((item, index) => index === rowIndex ? normalizedRow : item)
      : [...rows, normalizedRow],
  };
  persistDirectoryState();
}

function saveProjectDirectoryRow(rowIndex, row) {
  const stamp = new Date().toISOString();
  const normalizedProject = {
    id: row.id || makeId("p"),
    name: row.name || "Новый проект",
    orderNumber: row.orderNumber || "№0000",
    customer: row.customer || "",
    totalQuantity: Number(row.totalQuantity || 0),
    dueDate: row.dueDate || toDateInput(addMs(new Date(), 14 * 24 * 60 * 60 * 1000)),
    status: PROJECT_STATUSES.includes(row.status) ? row.status : "planned",
    createdAt: planningState.projects[rowIndex]?.createdAt || stamp,
    updatedAt: stamp,
  };

  if (rowIndex >= 0) {
    planningState.projects = planningState.projects.map((project, index) => index === rowIndex ? {
      ...project,
      ...normalizedProject,
    } : project);
  } else {
    const bundle = createProjectBundle({
      name: normalizedProject.name,
      orderNumber: normalizedProject.orderNumber,
      customer: normalizedProject.customer,
      totalQuantity: normalizedProject.totalQuantity,
      dueDate: normalizedProject.dueDate,
      status: normalizedProject.status,
      routeTemplate: "full",
    });
    planningState.projects = [...planningState.projects, { ...bundle.project, id: normalizedProject.id }];
    planningState.batches = [...planningState.batches, { ...bundle.batch, projectId: normalizedProject.id }];
    planningState.routes = [...planningState.routes, { ...bundle.route, projectId: normalizedProject.id }];
    planningState.routeSteps = [
      ...planningState.routeSteps,
      ...bundle.routeSteps.map((step) => ({ ...step, routeId: bundle.route.id })),
    ];
    planningState = normalizePlanningState(planningState);
  }
}

function saveWorkCenterDirectoryRow(rowIndex, row) {
  const normalizedCenter = {
    id: row.id || makeId("wc"),
    name: row.name || "Новый участок",
    code: row.code || "NEW",
    unitsPerHour: Math.max(1, Number(row.unitsPerHour || 40)),
    capacity: Math.max(1, Number(row.capacity || 1)),
    shift: row.shift || "08:00-20:00",
    description: row.description || "",
    isActive: row.status !== "inactive",
  };

  planningState.workCenters = rowIndex >= 0
    ? planningState.workCenters.map((center, index) => index === rowIndex ? normalizedCenter : center)
    : [...planningState.workCenters, normalizedCenter];
}

function saveRouteDirectoryRow(rowIndex, row) {
  const project = planningState.projects.find((item) => item.name === row.project) || planningState.projects[0];
  const normalizedRoute = {
    id: row.id || makeId("r"),
    projectId: planningState.routes[rowIndex]?.projectId || project?.id || planningState.projects[0]?.id,
    name: row.name || "Новый маршрут",
    isDefault: row.default === "yes",
  };

  planningState.routes = rowIndex >= 0
    ? planningState.routes.map((route, index) => index === rowIndex ? { ...route, ...normalizedRoute } : route)
    : [...planningState.routes, normalizedRoute];

  if (rowIndex < 0 && normalizedRoute.projectId) {
    const nextOrder = 1;
    planningState.routeSteps.push({
      id: `rs-${normalizedRoute.id}-warehouse`,
      routeId: normalizedRoute.id,
      workCenterId: "warehouse",
      operationName: "Склад",
      stepOrder: nextOrder,
      isRequired: true,
    });
  }
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

function renderToolbar(scaleInfo, stats) {
  const allProjectsExpanded = areAllVisibleProjectsExpanded();
  const statusOptions = [
    { value: "all", label: "Все статусы", meta: "портфель" },
    ...PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status], meta: "статус проекта" })),
  ];

  const workCenterOptions = [
    { value: "all", label: "Все участки", meta: "маршрут целиком" },
    ...planningState.workCenters.map((center) => ({ value: center.id, label: center.name, meta: center.code || "участок" })),
  ];

  return `
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-title">Планирование производства</div>
        <div class="brand-subtitle">Директорский контур планирования и мониторинга</div>
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

        <label class="field search-field">
          ${icon("search")}
          <input id="searchInput" type="search" placeholder="Проект, заказ, заказчик" value="${escapeAttribute(ui.search)}" />
        </label>

        <label class="field">
          <span>Статус</span>
          ${renderDenseInlineSelect("statusFilter", ui.statusFilter, statusOptions, { type: "toolbar" })}
        </label>

        <label class="field">
          <span>Участок</span>
          ${renderDenseInlineSelect("workCenterFilter", ui.workCenterFilter, workCenterOptions, { type: "toolbar" })}
        </label>

        <div class="segmented row-mode" role="group" aria-label="Режим строк">
          <button class="segment ${ui.rowMode === "route" ? "is-active" : ""}" data-row-mode="route" type="button">Маршрут</button>
          <button class="segment ${ui.rowMode === "all" ? "is-active" : ""}" data-row-mode="all" type="button">Все участки</button>
        </div>
      </div>

      <div class="toolbar-actions">
        <button class="toggle-switch-button ${allProjectsExpanded ? "is-on" : ""}" data-toggle-all-projects type="button" aria-pressed="${allProjectsExpanded ? "true" : "false"}" title="${allProjectsExpanded ? "Свернуть все проекты" : "Развернуть все проекты"}">
          <span class="toggle-switch-knob"></span>
          <span>${allProjectsExpanded ? "Свернуть" : "Развернуть"}</span>
        </button>
        <button class="icon-button" id="todayButton" type="button" title="Перейти к сегодняшнему дню">${icon("calendar")}</button>
        <button class="icon-button" id="refreshButton" type="button" title="Перестроить план">${icon("refresh")}</button>
        <button class="icon-button danger-soft" id="resetButton" type="button" title="Сбросить демо-данные">${icon("reset")}</button>
        <button class="primary-button" id="addProjectButton" type="button">${icon("plus")}<span>Добавить проект</span></button>
      </div>

      <div class="status-strip">
        <span class="status-pill neutral">${stats.projects} проектов</span>
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
  const riskyProjects = planningState.projects
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
          <button class="secondary-button" data-schedule-all-backlog type="button" ${backlog.length ? "" : "disabled"}>${icon("play")}<span>Запланировать очередь</span></button>
          <button class="secondary-button ${critical.length ? "danger" : ""}" data-fix-all-warnings type="button" ${warnings.length ? "" : "disabled"}>${icon("refresh")}<span>Исправить конфликты</span></button>
          <button class="secondary-button" data-save-plan-snapshot type="button">${icon("save")}<span>Снимок</span></button>
        </div>
      </div>

      <div class="director-flow-grid">
        ${flowSteps.map((step) => renderDirectorFlowStep(step)).join("")}
      </div>

      <div class="director-project-strip" aria-label="Приоритетные проекты">
        ${riskyProjects.slice(0, 5).map((item) => `
          <button class="director-project-chip ${item.dueState.tone}" data-focus-project="${item.project.id}" type="button">
            <strong>${escapeHtml(item.project.name)}</strong>
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
        <span>Проекты и участки</span>
      </div>
      <div class="timeline-cells" style="width:${scaleInfo.width}px; left:${LEFT_WIDTH}px;">
        ${scaleInfo.ticks.map((tick, index) => `
          <div class="timeline-cell" style="left:${index * scaleInfo.cellWidth}px; width:${scaleInfo.cellWidth}px;">
            <strong>${escapeHtml(tick.label)}</strong>
            <small>${escapeHtml(tick.sublabel)}</small>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderRow(row, rowLayout, scaleInfo, slotWarningMap, slotPlacementMap) {
  const layout = rowLayout.map[row.id];
  const height = layout.height;
  const laneClass = row.type === "project" ? "project-lane" : "workcenter-lane";
  const rowSlots = getRowSlots(row);
  const rowPlacements = slotPlacementMap[row.id] || {};
  const isDropTarget = ui.drag?.targetRowId === row.id;

  return `
    <div class="gantt-row ${row.type}-row ${isDropTarget ? "is-drop-target" : ""}" data-row-id="${row.id}" style="height:${height}px; top:${layout.top}px;">
      ${renderRowLabel(row, slotWarningMap)}
      <div class="lane ${laneClass}" data-lane-row-id="${row.id}" style="left:${LEFT_WIDTH}px; width:${scaleInfo.width}px; height:${height}px; --cell-width:${scaleInfo.cellWidth}px;">
        ${renderTodayMarker(scaleInfo, height)}
        ${rowSlots.map((slot) => renderSlot(slot, row, scaleInfo, slotWarningMap, rowPlacements[slot.id])).join("")}
      </div>
    </div>
  `;
}

function renderRowLabel(row, slotWarningMap = {}) {
  if (row.type === "project") {
    const project = row.project;
    const progress = calculateProjectProgress(project, planningState);
    const isExpanded = ui.expandedProjects.has(project.id);
    const issueCount = getSlotWarnings(planningState).warnings.filter((warning) => warning.projectId === project.id).length;
    const dueState = getProjectDeadlineState(project);

    return `
      <div class="row-label project-label">
        <button class="chevron" data-toggle-project="${project.id}" type="button" title="${isExpanded ? "Свернуть" : "Раскрыть"} проект">
          ${icon(isExpanded ? "chevronDown" : "chevronRight")}
        </button>
        <div class="project-main">
          <div class="project-name-line">
            <strong>${escapeHtml(project.name)}</strong>
            ${issueCount ? `<span class="mini-alert" title="Есть предупреждения">${issueCount}</span>` : ""}
            <span class="deadline-badge ${dueState.tone}" title="Запас до срока">${escapeHtml(dueState.label)}</span>
          </div>
          <div class="project-meta">${escapeHtml(project.orderNumber)} · ${project.totalQuantity} шт. · срок ${formatDate(project.dueDate)}</div>
          ${renderProjectRouteMini(project, slotWarningMap)}
        </div>
        <div class="project-side">
          <span class="project-status status-${project.status}">${PROJECT_STATUS_LABELS[project.status]}</span>
          <strong class="project-progress-value">${progress}%</strong>
          <div class="progress" title="Прогресс проекта"><span style="width:${progress}%"></span></div>
        </div>
      </div>
    `;
  }

  return `
    <div class="row-label workcenter-label">
      <span class="workcenter-code">${escapeHtml(row.workCenter.code)}</span>
      <span class="workcenter-name">${escapeHtml(row.workCenter.name)}</span>
      ${row.isOutsideRoute ? `<span class="outside-route">вне маршрута</span>` : ""}
    </div>
  `;
}

function renderProjectRouteMini(project, slotWarningMap = {}) {
  const steps = getProjectRouteSteps(project.id, planningState);
  const slots = planningState.slots.filter((slot) => slot.projectId === project.id);
  if (!steps.length) return "";

  return `
    <div class="project-route-mini" aria-label="Маршрут проекта">
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
  const isAggregate = row.type === "project";
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

  return `
    <article
      class="operation-slot status-${slot.status} ${warehouseClass} ${lockedClass} ${isAggregate ? "aggregate-slot" : ""} ${isWeekSlot ? "week-slot" : ""} ${compactClass} ${tinyClass} ${selectedClass} ${warningClass} ${dragClass}"
      data-slot-id="${slot.id}"
      style="left:${visualRect.x}px; top:${top}px; width:${visualRect.width}px; height:${height}px;"
      title="${escapeAttribute(`${project?.name || ""}: партия ${batch?.batchNumber || ""} · ${slot.operationName} · ${formatDuration(durationMs)}`)}"
      tabindex="0"
    >
      <div class="slot-accent"></div>
      <div class="slot-content">
        ${isWeekSlot ? `
          <div class="week-slot-line">
            <b>${escapeHtml(routeMeta.orderLabel)}</b>
            <strong>${escapeHtml(batch?.batchNumber || "")}</strong>
            <input class="slot-quantity-input compact" data-slot-quantity="${slot.id}" type="number" min="1" step="1" value="${quantity}" title="Количество изделий" ${isAggregate || slot.locked ? "disabled" : ""} />
            ${warningList.length ? `<span class="slot-warning-dot">${icon("alert")}</span>` : ""}
          </div>
        ` : `
          <div class="slot-line">
            <b class="slot-step-chip">${escapeHtml(routeMeta.orderLabel)}</b>
            <strong>Партия ${escapeHtml(batch?.batchNumber || "")}</strong>
            <label class="slot-quantity-control" title="Количество изделий в операции">
              <input data-slot-quantity="${slot.id}" type="number" min="1" step="1" value="${quantity}" ${isAggregate || slot.locked ? "disabled" : ""} />
              <span>шт.</span>
            </label>
            ${warningList.length ? `<span class="slot-warning-dot">${icon("alert")}</span>` : ""}
          </div>
        `}
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

function getSlotRouteMeta(slot) {
  const steps = getProjectRouteSteps(slot.projectId, planningState);
  const step = steps.find((item) => item.id === slot.routeStepId);
  const workCenter = getWorkCenter(slot.workCenterId);
  return {
    step,
    total: steps.length,
    orderLabel: step ? `${step.stepOrder}/${steps.length || "?"}` : "?",
    centerCode: workCenter?.code || slot.workCenterId || "-",
  };
}

function getSlotVisualRect(slot, scaleInfo, isAggregate = false) {
  const x = dateToX(slot.plannedStart, scaleInfo);
  const timeWidth = dateToX(slot.plannedEnd, scaleInfo) - x;
  if (ui.scale === "weeks") {
    const width = Math.max(isAggregate ? 18 : 20, timeWidth);
    return { x, width, right: x + width };
  }

  const minWidthByScale = { hours: 30, days: 28, weeks: 24 };
  const width = Math.max(isAggregate ? 18 : minWidthByScale[ui.scale], timeWidth);

  return {
    x,
    width,
    right: x + width,
  };
}

function renderDependencies(rows, rowLayout, scaleInfo, slotWarningMap, slotPlacementMap) {
  const visibleRowIds = new Set(rows.map((row) => row.id));
  const slotById = byId(planningState.slots);
  const paths = [];

  for (const pair of getDependencyPairs(planningState)) {
    const from = slotById[pair.fromSlotId];
    const to = slotById[pair.toSlotId];
    if (!from || !to) continue;

    const fromRowId = getVisibleSlotRowId(from);
    const toRowId = getVisibleSlotRowId(to);
    if (!fromRowId || !toRowId || !visibleRowIds.has(fromRowId) || !visibleRowIds.has(toRowId)) continue;
    if (fromRowId.startsWith("project:") || toRowId.startsWith("project:")) continue;

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
    const d = buildDependencyPathAroundSlots(x1, y1, x2, y2, fromRect, toRect);

    paths.push(`
      <path class="${underlayClassName}" d="${d}" />
      <path class="${className}" d="${d}" marker-end="url(#${markerId})" />
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
      </defs>
      ${paths.join("")}
    </svg>
  `;
}

function renderGanttSnapOverlay(rowLayout, scaleInfo, slotPlacementMap) {
  if (!ui.drag?.moved) return "";

  const slot = planningState.slots.find((item) => item.id === ui.drag.slotId);
  if (!slot) return "";

  const rowId = ui.drag.targetRowId || getVisibleSlotRowId(slot);
  const layout = rowLayout.map[rowId];
  if (!layout) return "";

  const isProjectRow = rowId.startsWith("project:");
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
  const riskyProjects = planningState.projects
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
            <strong>01 · Очередь операций</strong>
            <span>${backlog.length ? "следующие обязательные шаги маршрутов" : "очередь пуста"}</span>
          </div>
          <em>${backlog.length}</em>
        </div>
        <div class="assistant-list backlog-list">
          ${backlog.length ? backlog.map((item) => `
            <article class="assistant-item backlog-item">
              <button class="assistant-item-main" data-open-backlog data-backlog-project="${item.project.id}" data-backlog-batch="${item.batch.id}" data-backlog-step="${item.routeStep.id}" type="button">
                <strong>${escapeHtml(item.routeStep.operationName)}</strong>
                <span>${escapeHtml(item.project.name)} · партия ${escapeHtml(item.batch.batchNumber)} · ${item.quantity} шт.</span>
              </button>
              <div class="assistant-item-meta">
                <span>${escapeHtml(item.workCenter?.code || "")}</span>
                <span>${formatDateTime(item.plannedStart)}</span>
                <button class="mini-action" data-schedule-backlog data-backlog-project="${item.project.id}" data-backlog-batch="${item.batch.id}" data-backlog-step="${item.routeStep.id}" type="button">Поставить шаг</button>
                <button class="mini-action" data-schedule-project="${item.project.id}" type="button">Весь проект</button>
              </div>
            </article>
          `).join("") : `
            <div class="assistant-empty">${icon("check")}<span>Нет обязательных шагов без слота</span></div>
          `}
        </div>
        <div class="assistant-panel-actions">
          <button class="secondary-button" data-schedule-all-backlog type="button" ${backlog.length ? "" : "disabled"}>${icon("play")}<span>Запланировать всю очередь</span></button>
        </div>
      </section>

      <section class="assistant-panel conflict-panel">
        <div class="assistant-panel-head">
          <div>
            <strong>02 · Исправления</strong>
            <span>маршрут, перегрузка участка, количество</span>
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
            <strong>03 · Контроль плана</strong>
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
          <div><strong>${topWorkload?.label || "-"}</strong><span>самый загруженный участок</span></div>
          <div><strong>${riskyProjects.length}</strong><span>проектов у срока</span></div>
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
  const routeSteps = getProjectRouteSteps(slot.projectId, planningState);
  const currentStep = routeSteps.find((step) => step.id === slot.routeStepId);
  const orderedSlots = planningState.slots
    .filter((item) => item.projectId === slot.projectId && item.batchId === slot.batchId)
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
          <span class="eyebrow">MOD-03 · Right Detail Drawer</span>
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
          <span>Участок</span>
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
        <div><dt>Проект</dt><dd>${escapeHtml(project?.name || "")}</dd></div>
        <div><dt>Заказ</dt><dd>${escapeHtml(project?.orderNumber || "")}</dd></div>
        <div><dt>Участок</dt><dd>${escapeHtml(workCenter?.name || "")}</dd></div>
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
              <span class="eyebrow">MOD-02 · Form Modal · ${isEdit ? "Редактирование" : "Новый слот"}</span>
              <h2>${escapeHtml(project?.name || "Проект")}</h2>
            </div>
            <button class="icon-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
          </div>

          <input type="hidden" name="slotId" value="${isEdit ? slot.id : ""}" />
          <input type="hidden" name="projectId" value="${slot.projectId}" />

          <div class="form-grid">
            <label class="form-field readonly">
              <span>Проект</span>
              <input type="text" value="${escapeAttribute(project?.name || "")}" readonly />
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
              <span>Участок</span>
              <select name="workCenterId" id="workCenterField" required>
                ${planningState.workCenters.map((center) => `<option value="${center.id}" ${selected(slot.workCenterId || routeStep?.workCenterId, center.id)}>${escapeHtml(center.name)}</option>`).join("")}
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
              <span class="eyebrow">MOD-01 · Confirm Compact · Разделение</span>
              <h2>Партия ${escapeHtml(batch?.batchNumber || "")}</h2>
            </div>
            <button class="icon-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
          </div>

          <div class="confirm-body warning">
            <div class="confirm-icon">${icon("split")}</div>
            <div>
              <p>Новый слот сохранит проект, маршрутный шаг и участок. Исходный слот будет уменьшен на указанное количество.</p>
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
      <section class="modal large-modal wizard-modal" role="dialog" aria-modal="true" aria-label="Добавление проекта">
        <form id="projectForm">
          <div class="modal-header">
            <div>
              <span class="eyebrow">MOD-04 · Wizard Modal</span>
              <h2>Производственный заказ</h2>
            </div>
            <button class="icon-button" data-close-modal type="button" title="Закрыть">${icon("close")}</button>
          </div>

          <div class="debug-steps modal-steps">
            <span class="is-active">1 Проект</span>
            <span class="is-active">2 Заказ</span>
            <span class="is-active">3 Маршрут</span>
            <span>4 План</span>
          </div>

          <div class="form-grid">
            <label class="form-field">
              <span>Название проекта</span>
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
            <button class="primary-button" type="submit">${icon("plus")}<span>Добавить проект</span></button>
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
    ui.projectModal = true;
    render();
  });

  app.querySelector("[data-toggle-all-projects]")?.addEventListener("click", () => {
    const projects = getVisiblePlanningProjects();
    const shouldExpand = !areAllVisibleProjectsExpanded();
    projects.forEach((project) => {
      if (shouldExpand) ui.expandedProjects.add(project.id);
      else ui.expandedProjects.delete(project.id);
    });
    persistUiState();
    render();
  });

  app.querySelectorAll("[data-toggle-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.toggleProject;
      if (ui.expandedProjects.has(id)) ui.expandedProjects.delete(id);
      else ui.expandedProjects.add(id);
      render();
    });
  });

  app.querySelectorAll("[data-lane-row-id]").forEach((lane) => {
    lane.addEventListener("click", (event) => {
      if (event.target.closest(".operation-slot")) return;
      const row = rows.find((item) => item.id === lane.dataset.laneRowId);
      if (!row || row.type !== "workCenter") return;

      const rect = lane.getBoundingClientRect();
      const start = xToDate(event.clientX - rect.left, getGanttSnapScaleInfo(scaleInfo));
      openCreateSlot(row, start);
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

  app.querySelectorAll("[data-schedule-backlog]").forEach((button) => {
    button.addEventListener("click", () => {
      scheduleBacklogOperation(button.dataset.backlogProject, button.dataset.backlogBatch, button.dataset.backlogStep);
    });
  });

  app.querySelectorAll("[data-schedule-project]").forEach((button) => {
    button.addEventListener("click", () => {
      scheduleProjectBacklog(button.dataset.scheduleProject);
    });
  });

  app.querySelectorAll("[data-schedule-all-backlog]").forEach((button) => {
    button.addEventListener("click", () => openConfirmDialog("scheduleAllBacklog"));
  });

  app.querySelectorAll("[data-open-backlog]").forEach((button) => {
    button.addEventListener("click", () => {
      openBacklogOperation(button.dataset.backlogProject, button.dataset.backlogBatch, button.dataset.backlogStep);
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
    const plannedStart = cleanDateTime(data.get("plannedStart"));
    const selectedRouteStep = planningState.routeSteps.find((step) => step.id === data.get("routeStepId"));
    const unitsPerHour = Number(selectedRouteStep?.unitsPerHour || currentSlot?.unitsPerHour || 0);
    const plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(plannedStart, data.get("workCenterId"), quantity, planningState, unitsPerHour || null));
    const slotData = {
      projectId: data.get("projectId"),
      batchId: data.get("batchId"),
      workCenterId: data.get("workCenterId"),
      routeStepId: data.get("routeStepId"),
      operationName: String(data.get("operationName") || "").trim(),
      quantity,
      unitsPerHour: unitsPerHour || undefined,
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
    const sourcePlannedEnd = calculatePlannedEndByQuantity(sourceSlot.plannedStart, sourceSlot.workCenterId, sourceQuantity);
    const childPlannedEnd = calculatePlannedEndByQuantity(sourcePlannedEnd, sourceSlot.workCenterId, quantity);
    const childBatch = {
      id: makeId("b"),
      projectId: sourceSlot.projectId,
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
    render();
  });
}

function bindProjectForm() {
  const form = app.querySelector("#projectForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const bundle = createProjectBundle({
      name: String(data.get("name") || "").trim(),
      orderNumber: String(data.get("orderNumber") || "").trim(),
      customer: String(data.get("customer") || "").trim(),
      totalQuantity: Number(data.get("totalQuantity")),
      dueDate: data.get("dueDate"),
      status: data.get("status"),
      routeTemplate: data.get("routeTemplate"),
    });

    planningState.projects = [...planningState.projects, bundle.project];
    planningState.batches = [...planningState.batches, bundle.batch];
    planningState.routes = [...planningState.routes, bundle.route];
    planningState.routeSteps = [...planningState.routeSteps, ...bundle.routeSteps];
    ui.expandedProjects.add(bundle.project.id);
    ui.projectModal = false;
    if (ui.activeModule === "calculator") {
      calculatorState = normalizeCalculatorState({
        ...calculatorState,
        projectId: bundle.project.id,
        specificationId: "",
        bomListId: "",
        boardQuantity: normalizeOptionalPositiveInteger(bundle.project.totalQuantity),
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
    persistState();
    persistUiState();
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
      const nextQuantity = calculateQuantityByDuration(targetSlot.workCenterId, targetSlot.plannedStart, newEnd);
      targetSlot.quantity = nextQuantity;
      targetSlot.plannedEnd = toSlotDateTime(newEnd);
      targetSlot.updatedAt = new Date().toISOString();
    } else {
      const newStart = snapDate(addMs(ui.drag.originalStart, msDelta), snapMs);
      targetSlot.plannedStart = toSlotDateTime(newStart);

      const targetRow = rowFromPointer(moveEvent, rows, rowLayout);
      if (targetRow?.type === "workCenter" && targetRow.projectId === ui.drag.projectId) {
        targetSlot.workCenterId = targetRow.workCenterId;
        ui.drag.targetRowId = targetRow.id;
      }

      targetSlot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(newStart, targetSlot.workCenterId, targetSlot.quantity));
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

function openCreateSlot(row, start) {
  const projectBatches = planningState.batches.filter((batch) => batch.projectId === row.projectId);
  const routeStep = getProjectRouteSteps(row.projectId, planningState).find((step) => step.workCenterId === row.workCenterId)
    || getProjectRouteSteps(row.projectId, planningState)[0];
  const plannedStart = snapDate(start, getGanttSnapMs());
  const quantity = normalizeQuantity(projectBatches[0]?.quantity);
  const plannedEnd = calculatePlannedEndByQuantity(plannedStart, row.workCenterId, quantity, planningState, routeStep?.unitsPerHour || null);

  ui.editor = {
    mode: "create",
    defaults: {
      projectId: row.projectId,
      batchId: projectBatches[0]?.id,
      workCenterId: row.workCenterId,
      routeStepId: routeStep?.id,
      operationName: routeStep?.operationName || row.workCenter.name,
      quantity,
      unitsPerHour: routeStep?.unitsPerHour || undefined,
      plannedStart: toSlotDateTime(plannedStart),
      plannedEnd: toSlotDateTime(plannedEnd),
      status: "planned",
      comment: "",
    },
  };
  render();
}

function makeBacklogSlotDefaults(projectId, batchId, routeStepId) {
  const project = getProject(projectId);
  const batch = getBatch(batchId);
  const routeStep = planningState.routeSteps.find((step) => step.id === routeStepId);
  if (!project || !batch || !routeStep) return null;

  const quantity = normalizeQuantity(batch.quantity);
  const unitsPerHour = Number(routeStep.unitsPerHour || 0);
  const durationMs = calculateRequiredDurationMs(routeStep.workCenterId, quantity, planningState, unitsPerHour || null);
  const earliestStart = getEarliestRouteStart(projectId, batchId, routeStepId);
  const window = findFreeWindow(routeStep.workCenterId, durationMs, earliestStart);

  return {
    projectId,
    batchId,
    workCenterId: routeStep.workCenterId,
    routeStepId,
    operationName: routeStep.operationName,
    quantity,
    plannedStart: toSlotDateTime(window.start),
    plannedEnd: toSlotDateTime(window.end),
    actualStart: "",
    actualEnd: "",
    status: "planned",
    unitsPerHour: unitsPerHour || undefined,
    comment: "Создано из очереди незапланированных операций.",
  };
}

function openBacklogOperation(projectId, batchId, routeStepId) {
  const existing = planningState.slots.find((slot) => (
    slot.projectId === projectId && slot.batchId === batchId && slot.routeStepId === routeStepId
  ));
  if (existing) {
    focusSlot(existing.id);
    return;
  }

  const defaults = makeBacklogSlotDefaults(projectId, batchId, routeStepId);
  if (!defaults) return;
  ui.editor = { mode: "create", defaults };
  ui.expandedProjects.add(projectId);
  render();
}

function scheduleBacklogOperation(projectId, batchId, routeStepId) {
  const existing = planningState.slots.find((slot) => (
    slot.projectId === projectId && slot.batchId === batchId && slot.routeStepId === routeStepId
  ));
  if (existing) {
    focusSlot(existing.id);
    return;
  }

  const defaults = makeBacklogSlotDefaults(projectId, batchId, routeStepId);
  if (!defaults) return;

  const stamp = new Date().toISOString();
  const slot = {
    id: makeId("s"),
    ...defaults,
    createdAt: stamp,
    updatedAt: stamp,
  };
  planningState.slots = [...planningState.slots, slot];
  ui.selectedSlotId = slot.id;
  ui.expandedProjects.add(projectId);
  cascadeIfEnabled(slot.id);
  persistState();
  render();
}

function scheduleProjectBacklog(projectId) {
  const project = getProject(projectId);
  if (!project) return;

  const stamp = new Date().toISOString();
  const createdIds = [];
  let guard = 0;

  while (guard < 120) {
    guard += 1;
    const item = buildBacklogItems(240).find((candidate) => candidate.project.id === projectId);
    if (!item) break;

    const defaults = makeBacklogSlotDefaults(item.project.id, item.batch.id, item.routeStep.id);
    if (!defaults) break;

    const slot = {
      id: makeId("s"),
      ...defaults,
      createdAt: stamp,
      updatedAt: stamp,
    };
    planningState.slots = [...planningState.slots, slot];
    createdIds.push(slot.id);
    cascadeIfEnabled(slot.id);
  }

  if (createdIds.length) {
    ui.selectedSlotId = createdIds[createdIds.length - 1];
    ui.expandedProjects.add(projectId);
    persistState();
    render();
  } else {
    ui.expandedProjects.add(projectId);
    persistUiState();
    render();
  }
}

function scheduleAllBacklog() {
  const stamp = new Date().toISOString();
  const createdIds = [];
  let guard = 0;

  while (guard < 240) {
    guard += 1;
    const item = buildBacklogItems(240)[0];
    if (!item) break;

    const defaults = makeBacklogSlotDefaults(item.project.id, item.batch.id, item.routeStep.id);
    if (!defaults) break;

    const slot = {
      id: makeId("s"),
      ...defaults,
      createdAt: stamp,
      updatedAt: stamp,
    };
    planningState.slots = [...planningState.slots, slot];
    createdIds.push(slot.id);
    ui.expandedProjects.add(item.project.id);
    cascadeIfEnabled(slot.id);
  }

  if (createdIds.length) {
    ui.selectedSlotId = createdIds[createdIds.length - 1];
    persistState();
    persistUiState();
  }
  render();
}

function placeSlotInNearestWindow(slot, earliestOverride = null) {
  if (!slot || slot.locked || slot.status === "completed") return;

  const previous = getRouteNeighbor(slot, -1);
  const routeEarliest = previous ? addMs(previous.plannedEnd, getRouteBufferMs()) : toDate(slot.plannedStart);
  const earliestStart = new Date(Math.max(
    toDate(earliestOverride || slot.plannedStart).getTime(),
    toDate(routeEarliest).getTime(),
  ));
  const durationMs = calculateRequiredDurationMs(slot.workCenterId, slot.quantity, planningState, slot.unitsPerHour);
  const window = findFreeWindow(slot.workCenterId, durationMs, earliestStart, slot.id);

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
  render();
}

function toggleSlotLock(slotId) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  slot.locked = !slot.locked;
  slot.updatedAt = new Date().toISOString();
  persistState();
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
    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity));
    slot.updatedAt = stamp;
    return Boolean(placeSlotInNearestWindow(slot, slot.plannedStart));
  }

  if (warning.type === "quantity" && slots[0]) {
    const slot = slots[0];
    if (slot.locked || slot.status === "completed") return false;
    const previous = getRouteNeighbor(slot, -1);
    if (!previous) return false;
    slot.quantity = Math.min(normalizeQuantity(slot.quantity), normalizeQuantity(previous.quantity));
    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity));
    slot.updatedAt = stamp;
    cascadeIfEnabled(slot.id);
    return true;
  }

  if (warning.type === "duration" && slots[0]) {
    const slot = slots[0];
    if (slot.locked || slot.status === "completed") return false;
    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity));
    slot.updatedAt = stamp;
    cascadeIfEnabled(slot.id);
    return true;
  }

  if (warning.type === "route") {
    const anchorSlot = slots[0];
    const item = buildBacklogItems(240).find((backlogItem) => (
      backlogItem.project.id === warning.projectId
      && (!warning.batchId || backlogItem.batch.id === warning.batchId)
      && (!anchorSlot || backlogItem.batch.id === anchorSlot.batchId)
    ));
    if (!item) return false;
    const defaults = makeBacklogSlotDefaults(item.project.id, item.batch.id, item.routeStep.id);
    if (!defaults) return false;
    const slot = {
      id: makeId("s"),
      ...defaults,
      createdAt: stamp,
      updatedAt: stamp,
    };
    planningState.slots = [...planningState.slots, slot];
    ui.expandedProjects.add(item.project.id);
    ui.selectedSlotId = slot.id;
    cascadeIfEnabled(slot.id);
    return true;
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
    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity));
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
    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity));
    slot.updatedAt = stamp;
    cascadeIfEnabled(slot.id);
    persistState();
    render();
    return;
  }

  if (warning.type === "duration" && slots[0]) {
    const slot = slots[0];
    if (slot.locked) return;
    slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, slot.quantity));
    slot.updatedAt = stamp;
    cascadeIfEnabled(slot.id);
    persistState();
    render();
    return;
  }

  if (warning.type === "route" && slots[0]) {
    const item = buildBacklogItems(60).find((backlogItem) => (
      backlogItem.project.id === slots[0].projectId && backlogItem.batch.id === slots[0].batchId
    ));
    if (item) {
      scheduleBacklogOperation(item.project.id, item.batch.id, item.routeStep.id);
      return;
    }
  }

  focusSlot(slots[0]?.id || "");
}

function savePlanSnapshot() {
  const key = "mes-planning-prototype-plan-snapshots-v1";
  const snapshots = JSON.parse(localStorage.getItem(key) || "[]");
  snapshots.unshift({
    id: makeId("snap"),
    createdAt: new Date().toISOString(),
    projects: planningState.projects.length,
    slots: planningState.slots.length,
    state: planningState,
  });
  localStorage.setItem(key, JSON.stringify(snapshots.slice(0, 8)));
  alert("Снимок плана сохранен. Последние 8 снимков остаются в localStorage прототипа.");
}

function updateSlotQuantity(slotId, value) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  if (slot.locked) return;

  const quantity = normalizeQuantity(value, slot.quantity);
  slot.quantity = quantity;
  slot.plannedEnd = toSlotDateTime(calculatePlannedEndByQuantity(slot.plannedStart, slot.workCenterId, quantity));
  slot.updatedAt = new Date().toISOString();
  cascadeIfEnabled(slotId);
  persistState();
  render();
}

function cycleSlotStatus(slotId) {
  const slot = planningState.slots.find((item) => item.id === slotId);
  if (!slot) return;
  const index = SLOT_STATUSES.indexOf(slot.status);
  slot.status = SLOT_STATUSES[(index + 1) % SLOT_STATUSES.length];
  slot.updatedAt = new Date().toISOString();
  persistState();
  render();
}

function resetDemoState() {
  planningState = createDefaultPlanningState();
  ui.expandedProjects = new Set(["p-x100", "p-v2", "p-mes"]);
  ui.selectedSlotId = null;
  persistState();
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
  ui.expandedProjects.add(slot.projectId);
  render();

  requestAnimationFrame(() => {
    const element = app.querySelector(`[data-slot-id="${slotId}"]`);
    const shell = app.querySelector("[data-gantt-shell]");
    if (!element || !shell) return;
    element.scrollIntoView({ block: "center", inline: "center" });
    shell.scrollLeft = Math.max(0, shell.scrollLeft - LEFT_WIDTH / 2);
  });
}

function focusProject(projectId) {
  if (!projectId || !planningState.projects.some((project) => project.id === projectId)) return;
  ui.expandedProjects.add(projectId);
  ui.search = "";
  const firstSlot = planningState.slots
    .filter((slot) => slot.projectId === projectId)
    .sort((left, right) => toDate(left.plannedStart) - toDate(right.plannedStart))[0];
  ui.selectedSlotId = firstSlot?.id || null;
  persistUiState();
  render();

  requestAnimationFrame(() => {
    const element = app.querySelector(`[data-row-id="project:${projectId}"]`);
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
  const filteredProjects = getVisiblePlanningProjects();
  const rows = [];

  for (const project of filteredProjects) {
    const projectExpanded = ui.expandedProjects.has(project.id);
    const projectSlots = planningState.slots.filter((slot) => slot.projectId === project.id);
    rows.push({
      id: `project:${project.id}`,
      type: "project",
      project,
      projectId: project.id,
      height: getScaledRowHeight(PROJECT_ROW_HEIGHT, projectSlots, scaleInfo, true),
    });

    if (!projectExpanded) continue;

    const centers = getProjectCenters(project.id);
    for (const center of centers) {
      if (ui.workCenterFilter !== "all" && center.id !== ui.workCenterFilter) continue;
      const routeSteps = getProjectRouteSteps(project.id, planningState);
      const inRoute = routeSteps.some((step) => step.workCenterId === center.id);
      const centerSlots = getSlotsForProjectCenter(project.id, center.id);
      rows.push({
        id: `work:${project.id}:${center.id}`,
        type: "workCenter",
        projectId: project.id,
        workCenterId: center.id,
        workCenter: center,
        isOutsideRoute: !inRoute,
        height: getScaledRowHeight(WORK_ROW_HEIGHT, centerSlots, scaleInfo, false),
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
    map[row.id] = calculateSlotPlacements(getRowSlots(row), scaleInfo, row.type === "project").placements;
    return map;
  }, {});
}

function getScaledRowHeight(baseHeight, slots, scaleInfo, isAggregate) {
  if (ui.scale !== "weeks" || slots.length < 2) return baseHeight;

  const { levelCount } = calculateSlotPlacements(slots, scaleInfo, isAggregate);
  const slotHeight = getWeekSlotHeight(isAggregate);
  const requiredHeight = WEEK_SLOT_TOP * 2 + levelCount * slotHeight + Math.max(0, levelCount - 1) * WEEK_SLOT_GAP;
  return Math.max(baseHeight, Math.ceil(requiredHeight));
}

function calculateSlotPlacements(slots, scaleInfo, isAggregate = false) {
  const placements = {};

  if (ui.scale !== "weeks") {
    for (const slot of slots) {
      placements[slot.id] = {
        top: getSlotTop(isAggregate),
        height: getSlotHeight(isAggregate),
        level: 0,
        rect: getSlotVisualRect(slot, scaleInfo, isAggregate),
      };
    }
    return { placements, levelCount: slots.length ? 1 : 0 };
  }

  const slotHeight = getWeekSlotHeight(isAggregate);
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
      top: WEEK_SLOT_TOP + lane * (slotHeight + WEEK_SLOT_GAP),
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
  const base = ui.rowMode === "all" ? planningState.workCenters : [...routeCenters, ...slotCenters];
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

function projectMatchesFilters(project) {
  if (ui.statusFilter !== "all" && project.status !== ui.statusFilter) return false;

  if (ui.search.trim()) {
    const haystack = `${project.name} ${project.orderNumber} ${project.customer || ""}`.toLowerCase();
    if (!haystack.includes(ui.search.trim().toLowerCase())) return false;
  }

  if (ui.workCenterFilter !== "all") {
    const hasRouteCenter = getProjectRouteSteps(project.id, planningState).some((step) => step.workCenterId === ui.workCenterFilter);
    const hasSlotCenter = planningState.slots.some((slot) => slot.projectId === project.id && slot.workCenterId === ui.workCenterFilter);
    if (!hasRouteCenter && !hasSlotCenter) return false;
  }

  return true;
}

function getRowSlots(row) {
  if (row.type === "project") {
    return planningState.slots.filter((slot) => slot.projectId === row.projectId);
  }

  return planningState.slots.filter((slot) => (
    slot.projectId === row.projectId
    && slot.workCenterId === row.workCenterId
  ));
}

function getVisibleSlotRowId(slot) {
  if (!ui.expandedProjects.has(slot.projectId)) return `project:${slot.projectId}`;
  return `work:${slot.projectId}:${slot.workCenterId}`;
}

function buildStats(warnings) {
  return {
    projects: planningState.projects.length,
    slots: planningState.slots.length,
    critical: warnings.filter((warning) => warning.severity === "critical").length,
    warning: warnings.filter((warning) => warning.severity !== "critical").length,
  };
}

function getProject(id) {
  return planningState.projects.find((project) => project.id === id);
}

function getBatch(id) {
  return planningState.batches.find((batch) => batch.id === id);
}

function getWorkCenter(id) {
  return planningState.workCenters.find((center) => center.id === id);
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
    calculator: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M8 6h8M8 10h2M12 10h2M16 10h.01M8 14h2M12 14h2M16 14h.01M8 18h2M12 18h4"></path></svg>`,
    calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M8 2v4M16 2v4M3 10h18"></path></svg>`,
    refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-5l-2 2"></path><path d="M4 4v4h4"></path><path d="M4 13a8 8 0 0 0 14 5l2-2"></path><path d="M20 20v-4h-4"></path></svg>`,
    reset: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`,
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
  const moduleButton = event.target.closest?.("[data-module]");
  if (!moduleButton || !app.contains(moduleButton)) return;
  navigateToModule(moduleButton.dataset.module);
});

window.addEventListener("beforeunload", () => {
  rememberScroll();
  persistUiState();
  persistState();
  persistDirectoryState();
  persistCalculatorState();
  persistAuthState();
});
