import { MES_LEGACY_WORK_CENTER_NAME_MAP } from "./mes_org_model.js";

export const STORAGE_KEY = "mes-planning-prototype-state-v2";
export const UI_STORAGE_KEY = "mes-planning-prototype-ui-v1";
export const DIRECTORY_STORAGE_KEY = "mes-planning-prototype-directories-v2";
export const DIRECTORY_DEFAULTS_STORAGE_KEY = "mes-planning-prototype-directories-defaults-restored-v1";
export const SYSTEM_DOMAINS_STORAGE_KEY = "mes-planning-prototype-system-domains-v1";
// Written per tab only after the shared snapshot explicitly returns the
// PostgreSQL-primary tombstone. It prevents a brief API failure from causing
// this browser to recreate the retired legacy matrix.
export const SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY = "mes-planning-prototype-system-domains-primary-tombstone-v1";
export const SHARED_STATE_API_URL = "./api/shared-state";
export const SHARED_STATE_CLIENT_ID_KEY = "mes-planning-prototype-shared-client-id-v1";
export const SHARED_STATE_DISABLED_UNTIL_KEY = "mes-planning-prototype-shared-disabled-until-v1";
export const SHARED_UI_LOCAL_DIRTY_KEY = "mes-planning-prototype-shared-ui-dirty-v1";
// A focus/visibility return still checks immediately. The regular cadence is
// deliberately calmer: MES is collaborative, but not a chat application, and
// reducing background polls protects both pilot CPU and battery on long shifts.
export const SHARED_STATE_POLL_INTERVAL_MS = 12000;
export const SHARED_STATE_SAVE_DEBOUNCE_MS = 900;
export const SHARED_STATE_DISABLED_RECHECK_MS = 5 * 60 * 1000;
export const SHARED_UI_LOCAL_DIRTY_TTL_MS = 24 * 60 * 60 * 1000;
export const AUTH_GATE_SESSION_STORAGE_KEY = "mes-planning-prototype-auth-session-v1";
export const AUTH_PIN_TEMPORARILY_DISABLED = true;
export const MES_RUNTIME_CONFIG = (typeof window !== "undefined" && window.MES_APP_CONFIG && typeof window.MES_APP_CONFIG === "object")
  ? window.MES_APP_CONFIG
  : {};
export const MES_APP_ENV = String(MES_RUNTIME_CONFIG.APP_ENV || "local").trim().toLowerCase() || "local";
export const MES_PROTECTED_APP_ENVS = new Set(["pilot", "staging", "user-testing", "production"]);
export const MES_IS_PROTECTED_APP_ENV = MES_PROTECTED_APP_ENVS.has(MES_APP_ENV);
export const MES_ADMIN_RUNTIME_HOSTS = new Set(["admin.mes-line.ru"]);
export const MES_DESTRUCTIVE_ACTIONS_ALLOWED = MES_RUNTIME_CONFIG.MES_ALLOW_DESTRUCTIVE_ACTIONS === true;
export const BOOTSTRAP_SNAPSHOT_RESTORE_ENABLED = MES_RUNTIME_CONFIG.MES_ENABLE_BOOTSTRAP_SNAPSHOT_RESTORE !== false
  && (!MES_IS_PROTECTED_APP_ENV || MES_RUNTIME_CONFIG.MES_ENABLE_BOOTSTRAP_SNAPSHOT_RESTORE === true);
export const DATA_SAFETY_AUDIT_STORAGE_KEY = "mes-planning-prototype-data-safety-audit-v1";
export const STATE_RESET_BACKUP_STORAGE_KEY = "mes-planning-prototype-state-reset-backup-v1";
export const PLANNING_BACKUP_STORAGE_KEY = "mes-planning-prototype-planning-backup-v1";
export const DIRECTORY_BACKUP_STORAGE_KEY = "mes-planning-prototype-directories-backup-v1";
export const DIRECTORY_DELETED_ENTITIES_STORAGE_KEY = "mes-planning-prototype-directories-deleted-entities-v1";
export const WORK_CENTER_OPERATIONS_SEEDED_STORAGE_KEY = "mes-planning-prototype-work-center-operations-seeded-v2";
export const SPECIFICATIONS2_STORAGE_KEY = "mes-specifications-2-registry-v1";
export const STORAGE_KEYS = [
  STORAGE_KEY,
  UI_STORAGE_KEY,
  DIRECTORY_STORAGE_KEY,
  DIRECTORY_DEFAULTS_STORAGE_KEY,
  SYSTEM_DOMAINS_STORAGE_KEY,
  AUTH_GATE_SESSION_STORAGE_KEY,
  DIRECTORY_DELETED_ENTITIES_STORAGE_KEY,
  WORK_CENTER_OPERATIONS_SEEDED_STORAGE_KEY,
  SPECIFICATIONS2_STORAGE_KEY,
];
export const SHARED_STATE_VALUE_KEYS = [
  STORAGE_KEY,
  DIRECTORY_STORAGE_KEY,
  DIRECTORY_DEFAULTS_STORAGE_KEY,
  SYSTEM_DOMAINS_STORAGE_KEY,
  DIRECTORY_DELETED_ENTITIES_STORAGE_KEY,
  WORK_CENTER_OPERATIONS_SEEDED_STORAGE_KEY,
  SPECIFICATIONS2_STORAGE_KEY,
];

export const CRITICAL_DIRECTORY_SECTION_IDS = ["bomLists", "specifications"];
export const DEFAULT_INTERFACE_ROLE_ID = "admin";
export const INTERFACE_ROLES = [
  {
    id: DEFAULT_INTERFACE_ROLE_ID,
    label: "Администратор",
    caption: "полный доступ",
    icon: "unlock",
    moduleIds: null,
    defaultModule: "gantt",
  },
];
export const ACCESS_ROLE_ACTIONS = [
  { id: "view", label: "Просмотр", shortLabel: "Видит" },
  { id: "edit", label: "Редактирование", shortLabel: "Правит" },
  { id: "print", label: "Печать", shortLabel: "Печать" },
  { id: "assign", label: "Назначение", shortLabel: "Назн." },
  { id: "approve", label: "Утверждение", shortLabel: "Утв." },
  { id: "configure", label: "Настройка", shortLabel: "Настр." },
];
export const ACCESS_ROLE_SCOPES = [
  { id: "factory", label: "Вся система" },
  { id: "department", label: "Свой отдел" },
  { id: "workCenter", label: "Свои участки" },
  { id: "self", label: "Только свои задания" },
];
export const ACCESS_ROLE_IDS = ["admin", "productionHead", "planner", "technologist", "master", "dispatcher", "executor"];
export const LEFT_WIDTH = 360;
export const TIMELINE_HEIGHT = 48;
export const GANTT_SNAP_MS = 15 * 60 * 1000;
export const GANTT_DEPENDENCY_ARROW_LENGTH_MS = 90 * 60 * 1000;
export const GANTT_DEPENDENCY_ENTRY_MS = 90 * 60 * 1000;
export const GANTT_DEPENDENCY_ARROW_BASE_REF_X = 1;
export const GANTT_DEPENDENCY_ARROW_TIP_X = 9.5;
export const GANTT_DEPENDENCY_ARROW_HEAD_ADVANCE = GANTT_DEPENDENCY_ARROW_TIP_X - GANTT_DEPENDENCY_ARROW_BASE_REF_X;
export const TIMELINE_LOAD_CHUNK = { hours: 48, days: 30, weeks: 12 };
export const TIMELINE_MAX_COUNT = { hours: 2880, days: 540, weeks: 156 };
export const ROUTE_STEP_CALCULATION_TYPES = [
  {
    value: "components",
    label: "По компонентам",
    meta: "BOM, линия и компоненты",
    summaryLabel: "Компоненты",
    iconName: "bom",
  },
  {
    value: "manual",
    label: "Секунд на штуку",
    meta: "ручная трудоемкость по времени исполнителя",
    summaryLabel: "Сек/шт",
    iconName: "clock",
  },
  {
    value: "normative",
    label: "Секунд на цикл",
    meta: "время на панель или производственный цикл",
    summaryLabel: "Сек/цикл",
    iconName: "clock",
  },
  {
    value: "rate",
    label: "Штук в час",
    meta: "расчет от производительности отдела",
    summaryLabel: "Шт/час",
    iconName: "gantt",
  },
];
export const MES_SIGNAL_TYPES = {
  neutral: { label: "Нейтрально", tone: "neutral" },
  ready: { label: "Готово", tone: "ready" },
  risk: { label: "Риск", tone: "risk" },
  warning: { label: "Ожидание", tone: "warning" },
  blocked: { label: "Блокировка", tone: "blocked" },
  manual: { label: "Ручное вмешательство", tone: "manual" },
  test: { label: "Тестовый функционал", tone: "test" },
  calc: { label: "Расчетное поле", tone: "calc" },
  systemError: { label: "Системная ошибка", tone: "system-error" },
};
export const PROJECT_ROW_HEIGHT = 88;
export const WORK_ROW_HEIGHT = 68;
export const WEEK_SLOT_HEIGHT = 18;
export const WEEK_SLOT_GAP = 3;
export const WEEK_SLOT_TOP = 6;
export const STANDARD_SLOT_TOP = 21;
export const STANDARD_SLOT_HEIGHT = 26;
export const AGGREGATE_SLOT_TOP = 31;
export const AGGREGATE_SLOT_HEIGHT = STANDARD_SLOT_HEIGHT;
export const MIN_OPERATION_DURATION_MS = 5 * 60 * 1000;
export const DEFAULT_ROUTE_BUFFER_MS = 30 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RESOURCE_CPH = 30000;
export const DEPENDENCY_CROSSING_GAP_RADIUS = 7;
export const DEPENDENCY_HORIZONTAL_TRACK_GAP = 6;
export const SMT_LINE_WORKCENTER_PREFIX = "smt-line:";
export const GANTT_ZOOM_LEVELS = [0.75, 1, 1.5, 2, 3, 4, 6, 8];
export const GANTT_SLOT_CONTENT_MODES = [
  { id: "operationQuantity", label: "Операция + кол-во", shortLabel: "Опер. + кол." },
  { id: "operation", label: "Операция", shortLabel: "Операция" },
  { id: "quantity", label: "Количество", shortLabel: "Кол-во" },
  { id: "batchStep", label: "Заказ-наряд и шаг", shortLabel: "Заказ" },
];
export const EMPLOYEE_DEPARTMENT_MIGRATION = {
  "ПДО": "Отдел программной подготовки изделий",
  "Производство": "Отдел поверхностного монтажа",
  "STM отдел": "Отдел поверхностного монтажа",
};
export const UNIT_TYPE_LABELS = {
  production: "Производственное",
  administrative: "Административное",
  warehouse: "Склад",
  quality: "Контроль",
  service: "Сервисное",
};
export const PRODUCTION_RESOURCE_TYPE_LABELS = {
  aggregate: "Производственный ресурс",
  line: "Производственная линия",
  machine: "Станок",
  workplace: "Рабочее место",
  post: "Пост",
  equipment: "Оборудование",
  staff: "Исполнители",
  tool: "Оснастка",
  normative: "Расчетный ресурс",
};
export const HUMAN_LABOR_RESOURCE_TYPES = new Set(["staff", "workplace", "post"]);
export const MACHINE_LABOR_RESOURCE_TYPES = new Set(["aggregate", "line", "machine", "equipment"]);
export const PRODUCTION_RESOURCE_TYPE_CODES = {
  aggregate: "Рес.",
  line: "Лин.",
  machine: "Ст.",
  workplace: "РМ",
  post: "Пост",
  equipment: "Обор.",
  staff: "Исп.",
  tool: "Осн.",
  normative: "Расч.",
};
export const WORK_SCHEDULE_OPTIONS = [
  { value: "5/2", label: "5/2" },
  { value: "6/1", label: "6/1" },
  { value: "2/2", label: "2/2 бригады" },
  { value: "24/7", label: "24/7" },
];
export const WORK_MODE_OPTIONS = [
  { value: "08:00-20:00", label: "08:00-20:00" },
  { value: "20:00-08:00", label: "20:00-08:00" },
  { value: "00:00-24:00", label: "00:00-24:00" },
];
export const LEGACY_DEPARTMENT_TO_WORK_CENTER_ID = {
  ...MES_LEGACY_WORK_CENTER_NAME_MAP,
};
export const LEGACY_WORK_CENTER_NAME_MIGRATION = {
  "Слесарный участок": "Слесарно-сборочный отдел",
};
export const AUTH_GATE_PIN = "55555";
export const AUTH_GATE_MAX_ATTEMPTS = 5;
export const AUTH_GATE_DEFAULT_MODULE = "gantt";
export const AUTH_PIN_CHECK_DELAY_MS = 0;
export const AUTH_PIN_RESULT_DELAY_MS = 0;
export const AUTH_DEPARTMENT_ICON_BY_ID = {
  D1: "warehouse",
  D2: "book",
  D3: "bom",
  D3_CC: "package",
  D4: "check",
  D5: "worker",
  D6: "keyboard",
  D9: "settings",
  D11: "package",
  D_SERVICE: "settings",
};
export const AUTH_UNIT_ICON_BY_ID = {
  D3_L1: "gantt",
  D3_L2: "gantt",
  D3_AOI: "search",
  D3_UW: "package",
  D3_MANUAL_CC: "package",
  D5_L1: "worker",
  D5_L2: "worker",
  D5_L3: "worker",
  D5_L4: "worker",
  D9: "settings",
};
export const SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES = [
  {
    id: "department",
    label: "Свой отдел / ветка",
    shortLabel: "ветка",
    description: "Мастер распределяет всех исполнителей внутри своей ветки оргструктуры, включая дочерние участки.",
  },
  {
    id: "workCenter",
    label: "Только участок операции",
    shortLabel: "участок",
    description: "Мастер видит только исполнителей, закрепленных за точным участком операции.",
  },
  {
    id: "manual",
    label: "Ручной список",
    shortLabel: "ручной",
    description: "Доступ задается вручную чекбоксами в матрице мастеров.",
  },
  {
    id: "all",
    label: "Все исполнители",
    shortLabel: "все",
    description: "Мастер может распределять любого исполнителя из производственной матрицы.",
  },
];
