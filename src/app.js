import { createDefaultPlanningState } from "./data.js";
import { DEFAULT_PRODUCTION_WORK_CENTERS } from "./production_structure_default_work_centers.js";
import { SLOT_STATUSES, STATUS_LABELS } from "./types.js";
import {
  buildMesFlowEvent,
  buildMesDocumentContract,
  getMesFlowTransitionView,
  getMesFlowTransitionsForStatus,
  getMesDocumentKind,
  getMesModuleFlowContract,
  getMesStatusOptions,
  getMesStatusView,
  MES_STATUS_CONTRACTS,
} from "./mes_contracts.js";
import {
  addMs,
  buildTimeScale,
  dateToX,
  formatDate,
  formatDateTime,
  formatDuration,
  formatShortDate,
  formatTime,
  fromDateInput,
  getWeekNumber,
  isoLocal,
  scaleConfig,
  snapDate,
  startOfDay,
  startOfWeek,
  toDate,
  toDateInput,
} from "./time.js";
import {
  byId,
  calculateProjectProgress,
  getDependencyPairs,
  getProjectRouteSteps,
  getSlotWarnings,
  getWarningProductionId,
} from "./validation.js";
import {
  MES_LEGACY_WORK_CENTER_ID_MAP,
  MES_LEGACY_WORK_CENTER_NAME_MAP,
  MES_OBSOLETE_WORK_CENTER_IDS,
  MES_OPERATION_MAP,
  MES_ORG_STRUCTURE_VERSION,
  MES_SMT_WORK_CENTER_IDS,
} from "./mes_org_model.js";
import {
  UI_RUNTIME_DOM_NORMALIZER_CONTRACTS,
  UI_RUNTIME_TABLE_SCROLL_SELECTORS,
} from "./ui_runtime_contracts.js";
import {
  MES_MODULE_BLUEPRINT_REGISTRY,
  MES_MODULE_NAVIGATION_GROUPS,
  MES_MODULE_NAVIGATION_REGISTRY,
  getMesModuleBlueprintDefinition,
  getMesModuleNavigationDefinitions,
} from "./module_registry.js";
import { createMesModuleRuntime } from "./module_runtime.js";
import { createGeneratedModuleRuntimeAdapters } from "./generated/module_runtime_index.js";
import { createUiRenderers } from "./ui/components.js";
import { runLongTask } from "./ui/long_task_overlay.js";
import { createMesModulePatternRenderer } from "./ui/module_patterns.js";
import {
  escapeAttribute,
  escapeHtml,
  joinUiClasses,
  normalizeUiTone,
} from "./ui/html.js";
import { createAppInteractionsModule } from "./modules/app_interactions/render.js";
import { createPlanningWorkItemHelpers } from "./modules/planning_workbench/work_items.js";
import { createProductsRenderModule } from "./modules/products/render.js";
import { createNomenclatureReactIslandHost } from "./modules/nomenclature/react_island_host.js";
import { createNomenclatureServerOwnerClient } from "./modules/nomenclature/server_owner_client.js";
import { createBoardsReactIslandHost } from "./modules/nomenclature/boards_react_island_host.js";
import { createStructureEmployeesReactIslandHost, createStructureEquipmentReactIslandHost, createStructureMigrationDiagnosticsReactIslandHost, createStructureOrgUnitsReactIslandHost, createStructurePositionsReactIslandHost, createStructureResponsibilityPoliciesReactIslandHost, createStructureWorkCentersReactIslandHost } from "./modules/production_structure_matrix/react_island_host.js";
import { createRolesReactIslandHost } from "./modules/access_roles/react_island_host.js";
import { createDirectoryComponentTypesReactIslandHost, createDirectoryNomenclatureTypesReactIslandHost, createDirectoryOperationsReactIslandHost, createDirectoryStatusesReactIslandHost } from "./modules/directories/react_island_host.js";
import { createWeeklyProductionControlReactIslandHost } from "./modules/weekly_production_control/react_island_host.js";
import { getReactRuntimeMode, resolveReactRuntimeActivation } from "./modules/react_runtime_policy.js";
import { createTimesheetReactIslandHost } from "./modules/timesheet/react_island_host.js";
import { createPlanningWorkbenchReactIslandHost } from "./modules/planning_workbench/react_island_host.js";
import { createShiftWorkOrdersReactIslandHost, isShiftWorkOrdersWorkshopTargetSelected, resolveShiftWorkOrdersWorkshopNavigation } from "./modules/shift_work_orders/react_island_host.js";
import { createShiftMasterBoardReactIslandHost } from "./modules/shift_master_board/react_island_host.js";
import { createEmployeeDesktopReactIslandHost } from "./modules/auth_render/employee_desktop_react_island_host.js";
import { createMarkingReactIslandHost } from "./modules/marking/react_island_host.js";
import { createAuthPickerReactIslandHost } from "./modules/auth_render/auth_picker_react_island_host.js";
import { createContourAdminReactIslandHost } from "./modules/contour_admin/react_island_host.js";
import { createSpecifications2ReactIslandHost } from "./modules/specifications2/react_island_host.js";
import { createLazyGanttRuntimeModule } from "./modules/gantt_runtime/lazy_facade.js";
import { createGanttReactIslandHost } from "./modules/gantt_runtime/react_island_host.js";
import { createPlanningRoutesServiceModule } from "./modules/planning_routes/service.js";
import { createPlanningCoreServiceModule } from "./modules/planning_core/service.js";
import { createRuntimeStateServiceModule } from "./modules/runtime_state/service.js";
import { createSystemDomainsReadModel } from "./modules/domain_api/system_domains_read_model.js";
import { createSystemDomainsCommands } from "./modules/domain_api/system_domains_commands.js";
import { createOperationalRuntimeServiceModule } from "./modules/operational_runtime/service.js";
import { createAppEventsServiceModule } from "./modules/app_events/service.js";
import {
  loadSystemDomains,
  migrateLegacySystemDomains,
  normalizeSystemDomains,
  serializeSystemDomains,
  validateSystemDomains,
} from "./modules/system_domains/service.js";
import {
  getSystemDomainAccessSubject,
  getSystemDomainSummary,
  projectSystemDomainEmployees,
  projectSystemDomainResources,
  projectSystemDomainWorkCenters,
  toAccessControlAssignments,
  toAccessControlRoles,
  toPersonnelCalendarModel,
} from "./modules/system_domains/runtime_adapter.js";
import {
  DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  migrateLegacyTimesheetState,
  projectEmployeeAvailability as projectPersonnelEmployeeAvailability,
  resolveEffectiveScheduleAssignment as resolvePersonnelScheduleAssignment,
} from "./modules/personnel_calendar/service.js";
import { createAccessControlService } from "./modules/access_control/service.js";
import {
  BOOTSTRAP_SNAPSHOT_FILE_URL,
  BOOTSTRAP_SNAPSHOT_STORAGE_KEY,
  BOOTSTRAP_SNAPSHOT_VALUE_KEYS,
  getBootstrapSnapshotCountsFromState,
  isMeaningfulBootstrapSnapshotCounts,
  isUsableBootstrapSnapshot as isUsableBootstrapSnapshotPayload,
  shouldPreferBundledBootstrapSnapshot as shouldPreferBundledBootstrapSnapshotPayload,
} from "./modules/bootstrap_snapshot/service.js";
import { ACCESS_ROLE_ACTIONS, ACCESS_ROLE_IDS, ACCESS_ROLE_SCOPES, AGGREGATE_SLOT_HEIGHT, AGGREGATE_SLOT_TOP, AUTH_DEPARTMENT_ICON_BY_ID, AUTH_GATE_DEFAULT_MODULE, AUTH_GATE_MAX_ATTEMPTS, AUTH_GATE_PIN, AUTH_GATE_SESSION_STORAGE_KEY, AUTH_PIN_CHECK_DELAY_MS, AUTH_PIN_RESULT_DELAY_MS, AUTH_PIN_TEMPORARILY_DISABLED, AUTH_UNIT_ICON_BY_ID, BOOTSTRAP_SNAPSHOT_RESTORE_ENABLED, CRITICAL_DIRECTORY_SECTION_IDS, DATA_SAFETY_AUDIT_STORAGE_KEY, DAY_MS, DEFAULT_INTERFACE_ROLE_ID, DEFAULT_RESOURCE_CPH, DEFAULT_ROUTE_BUFFER_MS, DEPENDENCY_CROSSING_GAP_RADIUS, DEPENDENCY_HORIZONTAL_TRACK_GAP, DIRECTORY_BACKUP_STORAGE_KEY, DIRECTORY_DEFAULTS_STORAGE_KEY, DIRECTORY_DELETED_ENTITIES_STORAGE_KEY, DIRECTORY_STORAGE_KEY, EMPLOYEE_DEPARTMENT_MIGRATION, GANTT_DEPENDENCY_ARROW_BASE_REF_X, GANTT_DEPENDENCY_ARROW_HEAD_ADVANCE, GANTT_DEPENDENCY_ARROW_LENGTH_MS, GANTT_DEPENDENCY_ARROW_TIP_X, GANTT_DEPENDENCY_ENTRY_MS, GANTT_SLOT_CONTENT_MODES, GANTT_SNAP_MS, GANTT_ZOOM_LEVELS, HUMAN_LABOR_RESOURCE_TYPES, INTERFACE_ROLES, LEFT_WIDTH, LEGACY_DEPARTMENT_TO_WORK_CENTER_ID, LEGACY_WORK_CENTER_NAME_MIGRATION, MACHINE_LABOR_RESOURCE_TYPES, MES_ADMIN_RUNTIME_HOSTS, MES_APP_ENV, MES_DESTRUCTIVE_ACTIONS_ALLOWED, MES_IS_PROTECTED_APP_ENV, MES_SIGNAL_TYPES, MIN_OPERATION_DURATION_MS, PLANNING_BACKUP_STORAGE_KEY, PRODUCTION_RESOURCE_TYPE_CODES, PRODUCTION_RESOURCE_TYPE_LABELS, PROJECT_ROW_HEIGHT, ROUTE_STEP_CALCULATION_TYPES, SHARED_STATE_API_URL, SHARED_STATE_CLIENT_ID_KEY, SHARED_STATE_DISABLED_RECHECK_MS, SHARED_STATE_DISABLED_UNTIL_KEY, SHARED_STATE_POLL_INTERVAL_MS, SHARED_STATE_SAVE_DEBOUNCE_MS, SHARED_STATE_VALUE_KEYS, SHARED_UI_LOCAL_DIRTY_KEY, SHARED_UI_LOCAL_DIRTY_TTL_MS, SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES, SMT_LINE_WORKCENTER_PREFIX, STANDARD_SLOT_HEIGHT, STANDARD_SLOT_TOP, STATE_RESET_BACKUP_STORAGE_KEY, STORAGE_KEY, STORAGE_KEYS, TIMELINE_HEIGHT, TIMELINE_LOAD_CHUNK, TIMELINE_MAX_COUNT, UI_STORAGE_KEY, UNIT_TYPE_LABELS, WEEK_SLOT_GAP, WEEK_SLOT_HEIGHT, WEEK_SLOT_TOP, WORK_CENTER_OPERATIONS_SEEDED_STORAGE_KEY, WORK_MODE_OPTIONS, WORK_ROW_HEIGHT, WORK_SCHEDULE_OPTIONS } from "./app_constants.js";
import { MES_RUNTIME_CONFIG, SPECIFICATIONS2_STORAGE_KEY, SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY, SYSTEM_DOMAINS_STORAGE_KEY } from "./app_constants.js";
import {
  getMesCustomIconEntryBySemanticSlug,
  getMesCustomIconName,
  getMesCustomIconNameForRuntimeId,
  getMesCustomIconSvg,
  loadMesCustomIconSvgs,
} from "./icons/custom-mes/registry.js";

const {
  renderUiPanelHead,
  renderUiPanel,
  renderUiPanelBody,
  renderUiPanelFooter,
  renderUiEmptyState,
  renderUiStatusToken,
  renderUiDemoBadge,
  renderUiDemoCornerMarker,
  renderUiDemoInteractiveMarker,
  renderUiDemoInlineMarker,
  renderUiActionButton,
  renderUiActionFileLabel,
  renderUiActionBar,
  renderUiToolbar,
  renderUiFilterBar,
  renderUiFormSection,
  renderUiFormRow,
  renderUiSidebarItem,
  renderUiModuleSidebar,
  renderUiModulePage,
  renderUiModuleHeader,
  renderUiTableWrap,
  renderUiTableControlAttributes,
  renderUiInfoGrid,
  renderUiMetricGrid,
  renderUiFormField,
  renderUiFormGrid,
  renderUiFormActions,
  renderUiSystemState,
  renderUiDropdownFrame,
  renderUiModalFrame,
  renderUiModalShell,
  renderUiDrawerFrame,
  renderUiDrawerShell,
  renderUiGanttBar,
} = createUiRenderers({ icon });

const renderMesModulePatternPage = createMesModulePatternRenderer({
  getBlueprint: getMesModuleBlueprintDefinition,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiModuleSidebar,
});

const APP_VERSION_FALLBACK = "v.1.500.25";
const APP_VERSION = (
  typeof window !== "undefined"
  && typeof window.__MES_DEPLOY_VERSION__ === "string"
  && /^v\.\d\.\d{3}\.\d{2}$/.test(window.__MES_DEPLOY_VERSION__)
)
  ? window.__MES_DEPLOY_VERSION__
  : APP_VERSION_FALLBACK;

function appendLocalDataSafetyAudit(action = "", details = {}) {
  try {
    const current = JSON.parse(localStorage.getItem(DATA_SAFETY_AUDIT_STORAGE_KEY) || "[]");
    const events = Array.isArray(current) ? current : [];
    events.push({
      createdAt: new Date().toISOString(),
      appEnv: MES_APP_ENV,
      action,
      ...details,
    });
    localStorage.setItem(DATA_SAFETY_AUDIT_STORAGE_KEY, JSON.stringify(events.slice(-100)));
  } catch {
    // Local audit is best-effort and must never block the operator.
  }
}

function blockProtectedDestructiveAction(action = "", message = "Действие заблокировано для защиты данных пользователей") {
  if (!MES_IS_PROTECTED_APP_ENV || MES_DESTRUCTIVE_ACTIONS_ALLOWED) return false;
  appendLocalDataSafetyAudit(action, { status: "denied" });
  notifySaveSuccess(message);
  return true;
}

const app = document.querySelector("#app");
let appBootstrapped = false;
let mesCustomIconLoadScheduled = false;
let moduleRuntime = null;
let mesRenderDepth = 0;
let suppressedGanttSlotClick = null;
let sharedStateApplyingRemote = false;
let externalStorageSyncTimer = null;
const bootPerformance = {
  start: performance.now(),
  entries: [],
};
const sharedStateStatus = {
  configured: false,
  enabled: false,
  version: 0,
  saveTimer: null,
  pollTimer: null,
  saveInFlight: false,
  pollInFlight: false,
  pendingReason: "",
  pendingWriteMode: "",
  pendingSharedUiFull: null,
  sharedUiBase: null,
  lastSharedUiSignature: "",
};

const nomenclatureServerOwnerClient = createNomenclatureServerOwnerClient();
const NOMENCLATURE_CAPABILITIES_RECHECK_MS = 5_000;
let employeeServerSessionState = { status: "idle", authenticated: false, actor: null, error: "" };
let employeeServerSessionPromise = null;
let nomenclatureServerCapabilitiesState = { status: "idle", result: null, error: "" };
let nomenclatureServerCapabilitiesPromise = null;
let nomenclatureServerCapabilitiesFetchedAt = 0;
let nomenclatureEmployeeElevationState = { active: false, employeeId: "", returnModule: "nomenclature" };

function isEmployeeServerAuthRequired() {
  return MES_RUNTIME_CONFIG.MES_EMPLOYEE_AUTH_REQUIRED === true;
}

function isEmployeeServerAuthAvailable() {
  return MES_RUNTIME_CONFIG.MES_EMPLOYEE_AUTH_AVAILABLE === true
    || isNomenclatureServerCommandsPrimary();
}

function isNomenclatureEmployeeElevationActive() {
  return nomenclatureEmployeeElevationState.active === true;
}

function isNomenclatureServerCommandsPrimary() {
  return MES_RUNTIME_CONFIG.MES_NOMENCLATURE_SERVER_COMMANDS_PRIMARY === true;
}

function isLegacyDirectoryWriteBlocked() {
  return isNomenclatureServerCommandsPrimary();
}

function resetNomenclatureServerCapabilities() {
  nomenclatureServerCapabilitiesState = { status: "idle", result: null, error: "" };
  nomenclatureServerCapabilitiesFetchedAt = 0;
}

function getEmployeeServerActor() {
  return employeeServerSessionState.authenticated === true
    ? employeeServerSessionState.actor
    : null;
}

function getNomenclatureServerFailureMessage(result = null, fallback = "Серверная проверка недоступна.") {
  if (result?.authenticationRequired) return "Серверная сессия сотрудника не подтверждена. Выполните вход повторно.";
  if (result?.authorizationDenied) return "У сотрудника нет права изменять Номенклатуру.";
  if (result?.conflict) return "Номенклатура уже изменилась в другом сеансе. Экран обновлён; повторите команду.";
  if (result?.category === "rate-limit") return "Слишком много попыток. Подождите и повторите вход.";
  if (result?.unavailable || Number(result?.status || 0) === 0) return "Сервер Номенклатуры временно недоступен. Локальные данные не изменены.";
  return String(result?.error || result?.message || fallback);
}

async function createEmployeeServerSession({ employeeId = "", pin = "" } = {}) {
  if (!isEmployeeServerAuthAvailable()) {
    return { ok: false, code: "server-auth-disabled", message: "Серверная авторизация сотрудников отключена." };
  }
  employeeServerSessionState = { status: "loading", authenticated: false, actor: null, error: "" };
  resetNomenclatureServerCapabilities();
  const result = await nomenclatureServerOwnerClient.createEmployeeSession({ employeeId, pin });
  const actor = result?.ok === true && result.authenticated === true ? result.actor : null;
  if (!actor || String(actor.employeeId || "") !== String(employeeId || "")) {
    if (actor) void nomenclatureServerOwnerClient.deleteEmployeeSession().catch(() => {});
    employeeServerSessionState = {
      status: result?.ok === true ? "error" : "unauthenticated",
      authenticated: false,
      actor: null,
      error: actor
        ? "Сервер подтвердил другого сотрудника. Сессия закрыта."
        : getNomenclatureServerFailureMessage(result, "Не удалось подтвердить PIN на сервере."),
    };
    return {
      ...result,
      ok: false,
      authenticated: false,
      actor: null,
      code: actor ? "employee-actor-mismatch" : String(result?.code || "employee-session-rejected"),
      message: employeeServerSessionState.error,
    };
  }
  employeeServerSessionState = { status: "authenticated", authenticated: true, actor, error: "" };
  void ensureNomenclatureServerCapabilities({ force: true });
  return { ...result, ok: true, authenticated: true, actor };
}

function deleteEmployeeServerSession() {
  nomenclatureEmployeeElevationState = { active: false, employeeId: "", returnModule: "nomenclature" };
  employeeServerSessionState = { status: "unauthenticated", authenticated: false, actor: null, error: "" };
  resetNomenclatureServerCapabilities();
  if (!isEmployeeServerAuthAvailable()) return Promise.resolve({ ok: true, authenticated: false });
  return nomenclatureServerOwnerClient.deleteEmployeeSession();
}

function reconcileEmployeeServerSession({ force = false } = {}) {
  if (!isEmployeeServerAuthAvailable()) return Promise.resolve(employeeServerSessionState);
  if (!force && employeeServerSessionState.status === "authenticated") return Promise.resolve(employeeServerSessionState);
  if (employeeServerSessionPromise) return employeeServerSessionPromise;
  employeeServerSessionState = { status: "loading", authenticated: false, actor: null, error: "" };
  employeeServerSessionPromise = nomenclatureServerOwnerClient.getEmployeeSession().then((result) => {
    const actor = result?.ok === true && result.authenticated === true ? result.actor : null;
    employeeServerSessionState = actor
      ? { status: "authenticated", authenticated: true, actor, error: "" }
      : {
        status: result?.ok === true ? "unauthenticated" : "error",
        authenticated: false,
        actor: null,
        error: result?.ok === true ? "" : getNomenclatureServerFailureMessage(result),
      };
    resetNomenclatureServerCapabilities();
    if (ui && !isAuthGateQaBypassEnabled()) {
      const localEmployeeId = String(ui.authCurrentUserId || "");
      if (actor && (!localEmployeeId || localEmployeeId !== actor.employeeId)) {
        if (isEmployeeServerAuthRequired()) lockAuthGate();
        void nomenclatureServerOwnerClient.deleteEmployeeSession().catch(() => {});
        employeeServerSessionState = {
          status: "error",
          authenticated: false,
          actor: null,
          error: "Локальный сотрудник не совпадает с серверной сессией. Выполните вход повторно.",
        };
      } else if (isEmployeeServerAuthRequired() && !actor) {
        lockAuthGate();
      } else if (isEmployeeServerAuthRequired() && !planningCoreService.isAuthGateUnlocked?.()) {
        const people = typeof getAuthPrototypePeople === "function" ? getAuthPrototypePeople() : null;
        const person = (people?.employees || []).find((entry) => entry.id === actor.employeeId) || null;
        if (person) unlockAuthGate({ personId: person.id, roleId: inferAccessRoleIdForPerson(person) });
      }
      if (appBootstrapped) render({ skipRememberScroll: true });
    }
    if (actor) void ensureNomenclatureServerCapabilities({ force: true });
    return employeeServerSessionState;
  }).catch((error) => {
    employeeServerSessionState = {
      status: "error",
      authenticated: false,
      actor: null,
      error: `Серверная сессия недоступна: ${error?.message || String(error)}`,
    };
    return employeeServerSessionState;
  }).finally(() => { employeeServerSessionPromise = null; });
  return employeeServerSessionPromise;
}

function ensureNomenclatureServerCapabilities({ force = false } = {}) {
  const fresh = nomenclatureServerCapabilitiesState.status === "ready"
    && Date.now() - nomenclatureServerCapabilitiesFetchedAt < NOMENCLATURE_CAPABILITIES_RECHECK_MS;
  if (!force && fresh) return Promise.resolve(nomenclatureServerCapabilitiesState);
  if (nomenclatureServerCapabilitiesPromise) return nomenclatureServerCapabilitiesPromise;
  nomenclatureServerCapabilitiesState = { status: "loading", result: null, error: "" };
  nomenclatureServerCapabilitiesPromise = nomenclatureServerOwnerClient.getCapabilities().then((result) => {
    nomenclatureServerCapabilitiesState = {
      status: "ready",
      result: result?.ok === true ? result : null,
      error: result?.ok === true ? "" : getNomenclatureServerFailureMessage(result),
    };
    nomenclatureServerCapabilitiesFetchedAt = Date.now();
    if (appBootstrapped && ui?.activeModule === "nomenclature") {
      const updated = nomenclatureReactIslandHost?.update?.();
      if (!updated) render({ skipRememberScroll: true });
    }
    return nomenclatureServerCapabilitiesState;
  }).catch((error) => {
    nomenclatureServerCapabilitiesState = {
      status: "ready",
      result: null,
      error: `Права Номенклатуры недоступны: ${error?.message || String(error)}`,
    };
    nomenclatureServerCapabilitiesFetchedAt = Date.now();
    return nomenclatureServerCapabilitiesState;
  }).finally(() => { nomenclatureServerCapabilitiesPromise = null; });
  return nomenclatureServerCapabilitiesPromise;
}

function getNomenclatureElevationAuthModel() {
  const employeeId = String(nomenclatureEmployeeElevationState.employeeId || "");
  const model = getAuthPrototypeReactModel();
  const departments = (model.departments || []).flatMap((department) => {
    const directPeople = (department.directPeople || []).filter((person) => person.id === employeeId);
    const units = (department.units || []).flatMap((unit) => {
      const people = (unit.people || []).filter((person) => person.id === employeeId);
      return people.length ? [{ ...unit, people, employeeCount: people.length }] : [];
    });
    if (!directPeople.length && !units.length) return [];
    return [{ ...department, directPeople, units, employeeCount: directPeople.length + units.reduce((total, unit) => total + unit.people.length, 0) }];
  });
  return { ...model, departments, forcedPersonId: employeeId, elevation: true };
}

async function beginNomenclatureEmployeeElevation() {
  const person = getAuthenticatedAccessPerson();
  if (!person?.id || !isEmployeeServerAuthAvailable()) {
    return { ok: false, message: "Подтверждение PIN для текущего сотрудника недоступно." };
  }
  await deleteEmployeeServerSession().catch(() => {});
  nomenclatureEmployeeElevationState = { active: true, employeeId: person.id, returnModule: "nomenclature" };
  const authModel = getAuthPrototypeReactModel();
  const department = (authModel.departments || []).find((entry) => (
    (entry.directPeople || []).some((candidate) => candidate.id === person.id)
    || (entry.units || []).some((unit) => (unit.people || []).some((candidate) => candidate.id === person.id))
  )) || null;
  const unit = (department?.units || []).find((entry) => (entry.people || []).some((candidate) => candidate.id === person.id)) || null;
  cancelAuthPrototypePinFeedback();
  authPrototypePinDraft = "";
  authPrototypeKeypadDigits = [];
  ui.authPrototypeResult = "";
  ui.authPrototypeAttemptsLeft = AUTH_GATE_MAX_ATTEMPTS;
  ui.authPrototypeDepartment = String(department?.id || "");
  ui.authPrototypeUnit = String(unit?.id || "");
  ui.authPrototypePersonId = person.id;
  ui.activeModule = "authPrototype";
  updateModuleUrlParam(ui.activeModule);
  persistUiState();
  render({ skipRememberScroll: true });
  return { ok: true, id: person.id };
}

function finishNomenclatureEmployeeElevation(actor = null) {
  const localEmployeeId = String(getAuthenticatedAccessPerson()?.id || "");
  const expectedEmployeeId = String(nomenclatureEmployeeElevationState.employeeId || "");
  if (!localEmployeeId
    || localEmployeeId !== expectedEmployeeId
    || String(actor?.employeeId || "") !== expectedEmployeeId) {
    void deleteEmployeeServerSession().catch(() => {});
    return { ok: false, message: "Сервер подтвердил не текущего сотрудника. Сессия закрыта." };
  }
  const returnModule = nomenclatureEmployeeElevationState.returnModule || "nomenclature";
  nomenclatureEmployeeElevationState = { active: false, employeeId: "", returnModule: "nomenclature" };
  authPrototypePinDraft = "";
  authPrototypeKeypadDigits = [];
  ui.authPrototypeResult = "";
  ui.activeModule = returnModule;
  updateModuleUrlParam(returnModule);
  persistUiState();
  void ensureNomenclatureServerCapabilities({ force: true });
  render({ skipRememberScroll: true });
  return { ok: true, authenticated: true, personId: localEmployeeId };
}

function cancelNomenclatureEmployeeElevation() {
  if (!isNomenclatureEmployeeElevationActive()) return false;
  const returnModule = nomenclatureEmployeeElevationState.returnModule || "nomenclature";
  nomenclatureEmployeeElevationState = { active: false, employeeId: "", returnModule: "nomenclature" };
  void deleteEmployeeServerSession().catch(() => {});
  cancelAuthPrototypePinFeedback();
  authPrototypePinDraft = "";
  authPrototypeKeypadDigits = [];
  ui.authPrototypeResult = "";
  ui.activeModule = returnModule;
  updateModuleUrlParam(returnModule);
  persistUiState();
  render({ skipRememberScroll: true });
  return true;
}

async function getNomenclatureReactWriteDecisionForCommand(action = "edit") {
  let decision = getNomenclatureReactWriteDecision(action);
  if (!decision.allowed && nomenclatureServerCapabilitiesState.status === "loading") {
    await (nomenclatureServerCapabilitiesPromise || ensureNomenclatureServerCapabilities({ force: true }));
    decision = getNomenclatureReactWriteDecision(action);
  }
  return decision;
}

async function executeNomenclatureServerCommand(intent = {}, expectedRevision = 0) {
  const kind = String(intent.kind || "");
  const action = kind === "create" ? "create" : kind === "delete" ? "delete" : "edit";
  const decision = await getNomenclatureReactWriteDecisionForCommand(action);
  if (!decision.allowed) {
    return { ok: false, failClosed: true, status: 0, code: "write-unavailable", category: "authorization", message: decision.reason };
  }
  const commandInput = {
    itemId: String(intent.itemId || intent.row?.id || ""),
    row: intent.row,
    expectedRow: intent.expectedRow,
    expectedRevision,
    idempotencyKey: String(intent.idempotencyKey || ""),
  };
  const result = kind === "create"
    ? await nomenclatureServerOwnerClient.createNomenclature(commandInput)
    : kind === "update"
      ? await nomenclatureServerOwnerClient.updateNomenclature(commandInput)
      : kind === "delete"
        ? await nomenclatureServerOwnerClient.deleteNomenclature(commandInput)
        : { ok: false, status: 0, code: "invalid-command", category: "validation", error: "Unsupported Nomenclature command" };
  if (result?.authenticationRequired) {
    employeeServerSessionState = { status: "unauthenticated", authenticated: false, actor: null, error: "Серверная сессия сотрудника завершена." };
    resetNomenclatureServerCapabilities();
  }
  if (result?.ok === true) {
    const localEmployeeId = String(getAuthenticatedAccessPerson()?.id || "");
    if (!localEmployeeId || String(result.actorId || "") !== `employee:${localEmployeeId}`) {
      void nomenclatureServerOwnerClient.deleteEmployeeSession().catch(() => {});
      employeeServerSessionState = {
        status: "error",
        authenticated: false,
        actor: null,
        error: "Команду подтвердил другой серверный сотрудник. Сессия закрыта.",
      };
      resetNomenclatureServerCapabilities();
      return {
        ok: false,
        failClosed: true,
        status: Number(result.status || 0),
        code: "employee-actor-mismatch",
        category: "security",
        error: employeeServerSessionState.error,
      };
    }
  }
  return result;
}

let planningRoutesService = {};
function makeRouteOperationId(...args) { return planningRoutesService.makeRouteOperationId(...args); }
function getDefaultSecondsPerPanel(...args) { return planningRoutesService.getDefaultSecondsPerPanel(...args); }
function getComponentTypes(...args) { return planningRoutesService.getComponentTypes(...args); }
function getProjectSpecification(...args) { return planningRoutesService.getProjectSpecification(...args); }
function normalizeStructureFulfillmentMode(...args) { return planningRoutesService.normalizeStructureFulfillmentMode(...args); }
function getDefaultStructureFulfillmentMode(...args) { return planningRoutesService.getDefaultStructureFulfillmentMode(...args); }
function getExecutionTypeForFulfillmentMode(...args) { return planningRoutesService.getExecutionTypeForFulfillmentMode(...args); }
function getSpecificationItemFulfillmentMode(...args) { return planningRoutesService.getSpecificationItemFulfillmentMode(...args); }
function isSchedulableFulfillmentMode(...args) { return planningRoutesService.isSchedulableFulfillmentMode(...args); }
function getFulfillmentLabel(...args) { return planningRoutesService.getFulfillmentLabel(...args); }
function getFulfillmentMeta(...args) { return planningRoutesService.getFulfillmentMeta(...args); }
function getFulfillmentTone(...args) { return planningRoutesService.getFulfillmentTone(...args); }
function getDefaultStructureNomenclatureType(...args) { return planningRoutesService.getDefaultStructureNomenclatureType(...args); }
function inferStructureNomenclatureType(...args) { return planningRoutesService.inferStructureNomenclatureType(...args); }
function normalizeSpecificationStructureItem(...args) { return planningRoutesService.normalizeSpecificationStructureItem(...args); }
function buildDefaultSpecificationStructureItems(...args) { return planningRoutesService.buildDefaultSpecificationStructureItems(...args); }
function getSpecificationStructureItems(...args) { return planningRoutesService.getSpecificationStructureItems(...args); }
function getSpecificationBomCandidates(...args) { return planningRoutesService.getSpecificationBomCandidates(...args); }
function pickDefaultBomForSpecificationItem(...args) { return planningRoutesService.pickDefaultBomForSpecificationItem(...args); }
function getDefaultSpekiOperationName(...args) { return planningRoutesService.getDefaultSpekiOperationName(...args); }
function getSpekiOperationOptions(...args) { return planningRoutesService.getSpekiOperationOptions(...args); }
function getSpekiDepartmentOptions(...args) { return planningRoutesService.getSpekiDepartmentOptions(...args); }
function getDefaultSpekiDepartmentName(...args) { return planningRoutesService.getDefaultSpekiDepartmentName(...args); }
function getRouteStepsForModule(...args) { return planningRoutesService.getRouteStepsForModule(...args); }
function getRouteStepTaskId(...args) { return planningRoutesService.getRouteStepTaskId(...args); }
function getRouteStepsForTask(...args) { return planningRoutesService.getRouteStepsForTask(...args); }
function getRouteBaseTasks(...args) { return planningRoutesService.getRouteBaseTasks(...args); }
function getRouteUnscopedBaseTasks(...args) { return planningRoutesService.getRouteUnscopedBaseTasks(...args); }
function getRouteBaseTaskIds(...args) { return planningRoutesService.getRouteBaseTaskIds(...args); }
function isRouteStepLinkedToCurrentRouteTask(...args) { return planningRoutesService.isRouteStepLinkedToCurrentRouteTask(...args); }
function pruneRouteStepsOutsideCurrentRouteTasks(...args) { return planningRoutesService.pruneRouteStepsOutsideCurrentRouteTasks(...args); }
function getRouteProductionId(...args) { return planningRoutesService.getRouteProductionId(...args); }
function getRouteProductionContext(...args) { return planningRoutesService.getRouteProductionContext(...args); }
function getRoutePlanningContext(...args) { return planningRoutesService.getRoutePlanningContext(...args); }
function getRouteConcreteTasksForPlanning(...args) { return planningRoutesService.getRouteConcreteTasksForPlanning(...args); }
function getPlanningTasksForRoute(...args) { return planningRoutesService.getPlanningTasksForRoute(...args); }
function getRouteStepsForPlanningTask(...args) { return planningRoutesService.getRouteStepsForPlanningTask(...args); }
function getRouteForStep(...args) { return planningRoutesService.getRouteForStep(...args); }
function getRouteStepPlanningTask(...args) { return planningRoutesService.getRouteStepPlanningTask(...args); }
function getRouteStepEffectiveQuantityMultiplier(...args) { return planningRoutesService.getRouteStepEffectiveQuantityMultiplier(...args); }
function getRouteStepEffectiveBoardsPerPanel(...args) { return planningRoutesService.getRouteStepEffectiveBoardsPerPanel(...args); }
function getRouteStepEffectiveBomListId(...args) { return planningRoutesService.getRouteStepEffectiveBomListId(...args); }
function getRouteStepEffectiveOperationContext(...args) { return planningRoutesService.getRouteStepEffectiveOperationContext(...args); }
function normalizeRouteStepFlowItems(...args) { return planningRoutesService.normalizeRouteStepFlowItems(...args); }
function makeManualRouteStepFlowItems(...args) { return planningRoutesService.makeManualRouteStepFlowItems(...args); }
function getRouteStepManualFlowLabel(...args) { return planningRoutesService.getRouteStepManualFlowLabel(...args); }
function makeRouteStepFlowItem(...args) { return planningRoutesService.makeRouteStepFlowItem(...args); }
function getRouteTaskSourceSpecification(...args) { return planningRoutesService.getRouteTaskSourceSpecification(...args); }
function getRouteTaskSourceStructureItem(...args) { return planningRoutesService.getRouteTaskSourceStructureItem(...args); }
function getRouteTaskChildStructureItems(...args) { return planningRoutesService.getRouteTaskChildStructureItems(...args); }
function getRouteTaskProducedObjectLabel(...args) { return planningRoutesService.getRouteTaskProducedObjectLabel(...args); }
function renderRouteTaskOutputHint(...args) { return planningRoutesService.renderRouteTaskOutputHint(...args); }
function getRouteTaskInputObjectLabel(...args) { return planningRoutesService.getRouteTaskInputObjectLabel(...args); }
function isLastProductionStepForRouteTask(...args) { return planningRoutesService.isLastProductionStepForRouteTask(...args); }
function joinRouteStepFlowLabels(...args) { return planningRoutesService.joinRouteStepFlowLabels(...args); }
function getRouteStepFlowTarget(...args) { return planningRoutesService.getRouteStepFlowTarget(...args); }
function deriveRouteStepFlowItems(...args) { return planningRoutesService.deriveRouteStepFlowItems(...args); }
function getRouteStepFlowModel(...args) { return planningRoutesService.getRouteStepFlowModel(...args); }
function getSlotOperationFlow(...args) { return planningRoutesService.getSlotOperationFlow(...args); }
function renderOperationFlowMap(...args) { return planningRoutesService.renderOperationFlowMap(...args); }
function renderRouteStepFlowEditor(...args) { return planningRoutesService.renderRouteStepFlowEditor(...args); }
function renderRouteStepFlowSummary(...args) { return planningRoutesService.renderRouteStepFlowSummary(...args); }
function renderRouteStepFlowOverride(...args) { return planningRoutesService.renderRouteStepFlowOverride(...args); }
function renderRouteStepFlowToggle(...args) { return planningRoutesService.renderRouteStepFlowToggle(...args); }
function renderRouteStepFlowPanelRow(...args) { return planningRoutesService.renderRouteStepFlowPanelRow(...args); }
function getRouteStepCalculationTypeView(...args) { return planningRoutesService.getRouteStepCalculationTypeView(...args); }
function getRouteStepCalculationTypeOptions(...args) { return planningRoutesService.getRouteStepCalculationTypeOptions(...args); }
function getRouteStepLaborPlanningWorkCenterOptions(...args) { return planningRoutesService.getRouteStepLaborPlanningWorkCenterOptions(...args); }
function getRouteStepLaborSnapshot(...args) { return planningRoutesService.getRouteStepLaborSnapshot(...args); }
function renderRouteStepLaborReadout(...args) { return planningRoutesService.renderRouteStepLaborReadout(...args); }
function renderRouteStepResourceFactorReadout(...args) { return planningRoutesService.renderRouteStepResourceFactorReadout(...args); }
function renderRouteStepLaborToggle(...args) { return planningRoutesService.renderRouteStepLaborToggle(...args); }
function renderRouteStepLaborPanelRow(...args) { return planningRoutesService.renderRouteStepLaborPanelRow(...args); }
function getWorkCenterIdForRouteTask(...args) { return planningRoutesService.getWorkCenterIdForRouteTask(...args); }
function getSpecificationRouteTasks(...args) { return planningRoutesService.getSpecificationRouteTasks(...args); }
function getRouteBomTasks(...args) { return planningRoutesService.getRouteBomTasks(...args); }
function getRouteTasksForModule(...args) { return planningRoutesService.getRouteTasksForModule(...args); }
function getSchedulableRouteSteps(...args) { return planningRoutesService.getSchedulableRouteSteps(...args); }
function compareRouteStepsForScheduling(...args) { return planningRoutesService.compareRouteStepsForScheduling(...args); }
function getInvalidRouteOperationSteps(...args) { return planningRoutesService.getInvalidRouteOperationSteps(...args); }
function getSchedulableProjectRouteSteps(...args) { return planningRoutesService.getSchedulableProjectRouteSteps(...args); }
function ensureRouteTaskSeedSteps(...args) { return planningRoutesService.ensureRouteTaskSeedSteps(...args); }
function getProjectRouteForModule(...args) { return planningRoutesService.getProjectRouteForModule(...args); }
function getSpecificationRouteForModule(...args) { return planningRoutesService.getSpecificationRouteForModule(...args); }
function getActiveRouteForModule(...args) { return planningRoutesService.getActiveRouteForModule(...args); }
function getActiveRoute(...args) { return getActiveRouteForModule(...args); }
function getBomNomenclatureItem(...args) { return getNomenclatureItem(...args); }
function getRouteTransferSummary(...args) { return getPlanningRouteTransferSummary(...args); }
function getRouteModuleStats(...args) { return planningRoutesService.getRouteModuleStats(...args); }
function getRouteChildGenerationTasks(...args) { return planningRoutesService.getRouteChildGenerationTasks(...args); }
function getRouteTaskSubtreeIds(...args) { return planningRoutesService.getRouteTaskSubtreeIds(...args); }
function isDirectRouteChildTask(...args) { return planningRoutesService.isDirectRouteChildTask(...args); }
function getRouteLinkedChildTasks(...args) { return planningRoutesService.getRouteLinkedChildTasks(...args); }
function getRouteLinkedChildDocuments(...args) { return planningRoutesService.getRouteLinkedChildDocuments(...args); }
function findGeneratedChildRoute(...args) { return planningRoutesService.findGeneratedChildRoute(...args); }
function getGeneratedChildRouteName(...args) { return planningRoutesService.getGeneratedChildRouteName(...args); }
function shouldRefreshGeneratedChildRouteName(...args) { return planningRoutesService.shouldRefreshGeneratedChildRouteName(...args); }
function buildChildRouteCard(...args) { return planningRoutesService.buildChildRouteCard(...args); }
function cloneRouteStepForChildRoute(...args) { return planningRoutesService.cloneRouteStepForChildRoute(...args); }
function syncGeneratedChildRouteSteps(...args) { return planningRoutesService.syncGeneratedChildRouteSteps(...args); }
function getRouteGenerationRoot(...args) { return planningRoutesService.getRouteGenerationRoot(...args); }
function generateChildRouteCardsForActiveRoute(...args) { return planningRoutesService.generateChildRouteCardsForActiveRoute(...args); }
function getRouteDeleteUsage(...args) { return planningRoutesService.getRouteDeleteUsage(...args); }
function deleteRouteMapConfirmed(...args) { return planningRoutesService.deleteRouteMapConfirmed(...args); }
function ensureProjectBatches(...args) { return planningRoutesService.ensureProjectBatches(...args); }
function ensureRouteBatches(...args) { return planningRoutesService.ensureRouteBatches(...args); }
function comparePlanningBatches(...args) { return planningRoutesService.comparePlanningBatches(...args); }
function getRoutePlanningOrder(...args) { return planningRoutesService.getRoutePlanningOrder(...args); }
function getRoutePlanningBatches(...args) { return planningRoutesService.getRoutePlanningBatches(...args); }
function getPlanningBatchSlots(...args) { return planningRoutesService.getPlanningBatchSlots(...args); }
function getPlanningRouteSlots(...args) { return planningRoutesService.getPlanningRouteSlots(...args); }
function getPlanningRouteOrderState(...args) { return planningRoutesService.getPlanningRouteOrderState(...args); }
function getRouteCardViewModel(...args) { return planningRoutesService.getRouteCardViewModel(...args); }
function getWorkOrderPlanningStatusView(...args) { return planningRoutesService.getWorkOrderPlanningStatusView(...args); }
function getWorkOrderViewModel(...args) { return planningRoutesService.getWorkOrderViewModel(...args); }
function getPlanningOrderSourceLabel(...args) { return planningRoutesService.getPlanningOrderSourceLabel(...args); }
function getPlanningOrderObjectLabel(...args) { return planningRoutesService.getPlanningOrderObjectLabel(...args); }
function getPlanningWorkOrderTitle(...args) { return planningRoutesService.getPlanningWorkOrderTitle(...args); }
function getPlanningWorkOrderQueueTitle(...args) { return planningRoutesService.getPlanningWorkOrderQueueTitle(...args); }
function getPlanningWorkOrderSubtitle(...args) { return planningRoutesService.getPlanningWorkOrderSubtitle(...args); }
function getPlanningShiftDateLabel(...args) { return planningRoutesService.getPlanningShiftDateLabel(...args); }
function getPlanningShiftSlotTimeLabel(...args) { return planningRoutesService.getPlanningShiftSlotTimeLabel(...args); }
function getPlanningShiftOrderTone(...args) { return planningRoutesService.getPlanningShiftOrderTone(...args); }
function getPlanningShiftOrderStatusLabel(...args) { return planningRoutesService.getPlanningShiftOrderStatusLabel(...args); }
function getPlanningShiftOrdersForRoute(...args) { return planningRoutesService.getPlanningShiftOrdersForRoute(...args); }
function getPlanningBatchQuantityTotal(...args) { return planningRoutesService.getPlanningBatchQuantityTotal(...args); }
function getPlanningRouteQuantity(...args) { return planningRoutesService.getPlanningRouteQuantity(...args); }
function getPlanningRouteStartDate(...args) { return planningRoutesService.getPlanningRouteStartDate(...args); }
function getPlanningRouteAnchorStart(...args) { return planningRoutesService.getPlanningRouteAnchorStart(...args); }
function syncPlanningRouteQuantity(...args) { return planningRoutesService.syncPlanningRouteQuantity(...args); }
function syncPlanningRouteStartDate(...args) { return planningRoutesService.syncPlanningRouteStartDate(...args); }
function recalculatePlanningBatchSlots(...args) { return planningRoutesService.recalculatePlanningBatchSlots(...args); }
function getPlanningBoardsPerPanelOverrides(...args) { return planningRoutesService.getPlanningBoardsPerPanelOverrides(...args); }
function getPlanningBoardsPerPanel(...args) { return planningRoutesService.getPlanningBoardsPerPanel(...args); }
function syncPlanningBoardsPerPanel(...args) { return planningRoutesService.syncPlanningBoardsPerPanel(...args); }
function updatePlanningSupplyFulfillment(...args) { return planningRoutesService.updatePlanningSupplyFulfillment(...args); }
function getRouteStepQuantityForBatch(...args) { return planningRoutesService.getRouteStepQuantityForBatch(...args); }
function getPlanningMultiplicationRows(...args) { return planningRoutesService.getPlanningMultiplicationRows(...args); }
function getPlanningRouteTransferSummary(...args) { return planningRoutesService.getPlanningRouteTransferSummary(...args); }
function getPlanningScheduleAnchorStart(...args) { return planningRoutesService.getPlanningScheduleAnchorStart(...args); }
function createSlotFromRouteStep(...args) { return planningRoutesService.createSlotFromRouteStep(...args); }
function scheduleRouteBatchOptimally(...args) { return planningRoutesService.scheduleRouteBatchOptimally(...args); }
function getRouteStepsMissingPlanningLine(...args) { return planningRoutesService.getRouteStepsMissingPlanningLine(...args); }
function getRouteStepsMissingPlanningLabor(...args) { return planningRoutesService.getRouteStepsMissingPlanningLabor(...args); }
function getPlanningRouteLaborReadiness(...args) { return planningRoutesService.getPlanningRouteLaborReadiness(...args); }
function schedulePlanningRouteToGantt(...args) { return planningRoutesService.schedulePlanningRouteToGantt(...args); }
function getPlanningOrderLaborSlotFields(...args) { return planningCoreService.getPlanningOrderLaborSlotFields(...args); }
function cancelPlanningRoute(...args) { return planningRoutesService.cancelPlanningRoute(...args); }
function openPlanningForProject(...args) { return planningRoutesService.openPlanningForProject(...args); }
function openPlanningForRoute(...args) { return planningRoutesService.openPlanningForRoute(...args); }
function initializePlanningRoutesServiceModule() {
  planningRoutesService = createPlanningRoutesServiceModule({

  DEFAULT_COMPONENT_TYPES,
  MAIN_ROUTE_TASK_ID,
  MES_SMT_WORK_CENTER_IDS,
  NOMENCLATURE_REA_COMPONENT_TYPE,
  PRODUCTION_RESOURCE_TYPE_LABELS,
  ROUTE_STEP_CALCULATION_TYPES,
  STRUCTURE_FULFILLMENT_LABELS,
  STRUCTURE_FULFILLMENT_META,
  STRUCTURE_FULFILLMENT_MODES,
  STRUCTURE_SCHEDULABLE_FULFILLMENT_MODES,
  addMs,
  alignRouteMainSlotsAfterBranches,
  buildMesDocumentContract,
  buildMesFlowEvent,
  byId,
  calculateRequiredDurationMs,
  escapeAttribute,
  escapeHtml,
  formatDateTimeShort,
  formatDuration,
  formatReportNumber,
  // A cold "Передать в Гант" switches the module before the lazy Gantt chunk
  // has loaded. Rendering here starts its loading shell; the route selection
  // is already persisted by the caller and will be rendered after `load()`.
  focusRoute: (...args) => ganttRuntime?.isReady?.() ? focusRoute(...args) : render(),
  fromDateInput,
  getBatch, getBomList: (...args) => typeof getBomList === "function" ? getBomList(...args) : null, getBomResultNomenclatureItem: (...args) => typeof getBomResultNomenclatureItem === "function" ? getBomResultNomenclatureItem(...args) : null,
  getDefaultOperationCalculationType,
  getDurationBomList, getRouteBomList: (...args) => typeof getRouteBomList === "function" ? getRouteBomList(...args) : [],
  getGanttSlotStatusView,
  getGanttSnapMs,
  getMainRouteDependencyReadyAt,
  getManualPlanningAssignmentForRouteStep,
  getMesDocumentKind,
  getMesFlowTransitionView,
  getMesStatusView,
  getOperationMapItem,
  getOperationMapRows,
  getOperationRouteWorkCenterId,
  getPlanningResourceForRouteStep,
  getPlanningOrderLaborSlotFields,
  getPlanningSupplyBlockingIssues,
  getPlanningWorkCenters,
  getProductionContextForSpecification,
  getProductionResource,
  getProject,
  getProjectDisplayName,
  getProjectDisplayOutput,
  getResourceBaseCph,
  getRouteBufferMs, getRouteDocumentKind: (...args) => typeof getRouteDocumentKind === "function" ? getRouteDocumentKind(...args) : "main", getRouteDocumentKindLabel: (...args) => typeof getRouteDocumentKindLabel === "function" ? getRouteDocumentKindLabel(...args) : "Маршрутная карта", getRouteDocumentKindShortLabel: (...args) => typeof getRouteDocumentKindShortLabel === "function" ? getRouteDocumentKindShortLabel(...args) : "Карта", getRouteLineageSubjectName: (...args) => typeof getRouteLineageSubjectName === "function" ? getRouteLineageSubjectName(...args) : "", getRouteModuleSelectionName: (...args) => typeof getRouteModuleSelectionName === "function" ? getRouteModuleSelectionName(...args) : "", getRouteModuleSelectionValue: (...args) => typeof getRouteModuleSelectionValue === "function" ? getRouteModuleSelectionValue(...args) : "", getRouteRootRoute: (...args) => typeof getRouteRootRoute === "function" ? getRouteRootRoute(...args) : null, getRouteScopeRootTask: (...args) => typeof getRouteScopeRootTask === "function" ? getRouteScopeRootTask(...args) : null, getRouteSpecification: (...args) => typeof getRouteSpecification === "function" ? getRouteSpecification(...args) : null, getRoutesForModule: (...args) => typeof getRoutesForModule === "function" ? getRoutesForModule(...args) : [],
  getRouteStepBoardsPerPanel,
  getRouteStepExplicitPlanningWorkCenterId,
  getRouteStepPlanningCandidateWorkCenterIds,
  getRouteStepSelectedPlanningWorkCenterId,
  getRuntimePlanningState,
  getSlotDurationHours,
  getSlotPlanningOrderId,
  getSlotProductionContextId,
  getSlotRouteId,
  getSlotWarnings,
  getWarningProductionId,
  getSpecificationItemBoardsPerPanel, getSpecificationBomEntries: (...args) => typeof getSpecificationBomEntries === "function" ? getSpecificationBomEntries(...args) : [], getSpecificationById: (...args) => typeof getSpecificationById === "function" ? getSpecificationById(...args) : null, getSpecificationItemBomId: (...args) => typeof getSpecificationItemBomId === "function" ? getSpecificationItemBomId(...args) : "", getSpekiStructureItemDisplayName: (...args) => typeof getSpekiStructureItemDisplayName === "function" ? getSpekiStructureItemDisplayName(...args) : "", getSpekiStructureItemLabel: (...args) => typeof getSpekiStructureItemLabel === "function" ? getSpekiStructureItemLabel(...args) : "", getSpekiStructureTableRows: (...args) => typeof getSpekiStructureTableRows === "function" ? getSpekiStructureTableRows(...args) : [],
  getWorkCenter,
  getWorkCenterManualCapacity,
  getWorkCenterUnitsPerHour,
  getWorkOrderPlanningStatus,
  getWorkOrderPlanningStatusValue: (route = {}) => { const rawStatus = String(route?.planningStatus || "").trim(); return WORK_ORDER_PLANNING_STATUS_VALUES.has(rawStatus) ? rawStatus : "queued"; },
  icon,
  isGanttSlotCompleted: (slot = {}) => slot?.status === "completed" || slot?.completed === true,
  isManufacturingOutputReceiptRouteStep,
  isLegacyDirectoryWriteBlocked,
  isPlanningWorkCenter,
  isSmtOperationWorkCenter,
  isWarehouseIssueRouteStep,
  isWarehouseWorkCenterId,
  isWorkOrderPlanningCanceled,
  makeId,
  mapLegacyWorkCenterId,
  normalizeBoardsPerPanel,
  normalizeDirectoryState, normalizeNomenclatureType,
  normalizeOptionalPositiveInteger,
  normalizePlanningState,
  normalizeQuantity,
  normalizeRouteStepCalculationFields,
  notifySaveSuccess,
  parseCapacityCount,
  persistDirectoryState,
  persistState,
  persistUiState,
  recalculateSlotEndByQuantity,
  render,
  renderDenseInlineSelect,
  resourceParticipatesInCalculation,
  resourceParticipatesInPlanning,
  routeStepRequiresManualPlanningLine,
  selected,
  slotMatchesPlanningOrder,
  slotMatchesProductionContext,
  snapDate,
  // Planning can calculate a route anchor before a user has opened Gantt.
  // The date has already been snapped to the common grid; defer the
  // work-calendar refinement until the timeline implementation is available.
  snapToWorkingTime: (...args) => ganttRuntime?.isReady?.() ? snapToWorkingTime(...args) : args[1],
  toDate,
  toDateInput,
  toSlotDateTime,
  withPlanningEntityRemovalAllowed,
  getUi: () => ui,
  setUi: (nextState) => { ui = nextState; },
  getPlanningState: () => planningState,
  setPlanningState: setPlanningStateAndInvalidate,
  getDirectoryState: () => directoryState,
  setDirectoryState: (nextState) => { directoryState = nextState; },
  });
}

function getPlanningTableSlotRoute(slot = {}, step = null) {
  const routes = planningState.routes || [];
  const stepRouteId = String(step?.routeId || "").trim();
  if (stepRouteId) return routes.find((route) => route.id === stepRouteId) || null;

  const slotRouteId = getSlotRouteId(slot, planningState);
  if (slotRouteId) return routes.find((route) => route.id === slotRouteId) || null;

  const matchesProduction = (route = {}) => (
    route.specificationId === slot?.specificationId
    || route.specificationId === slot?.projectId
    || route.projectId === slot?.projectId
  );
  return routes.find((route) => matchesProduction(route) && route.isDefault)
    || routes.find(matchesProduction)
    || null;
}

// These compact resolvers are deliberately independent of the lazy Gantt
// runtime.  The workshop and weekly control both need the same small slot
// context before a user has ever opened the Gantt page.
function getPlanningSlotStep(slot = {}, state = planningState) {
  const routeStepId = String(slot?.routeStepId || "").trim();
  return routeStepId
    ? (state?.routeSteps || []).find((item) => item?.id === routeStepId) || null
    : null;
}

function getPlanningSlotRoute(slot = {}, state = planningState) {
  const step = getPlanningSlotStep(slot, state);
  if (state === planningState) return getPlanningTableSlotRoute(slot, step);
  const routes = state?.routes || [];
  const routeId = String(step?.routeId || getSlotRouteId(slot, state) || "").trim();
  if (routeId) return routes.find((route) => route?.id === routeId) || null;
  const matchesProduction = (route = {}) => (
    route.specificationId === slot?.specificationId
    || route.specificationId === slot?.projectId
    || route.projectId === slot?.projectId
  );
  return routes.find((route) => matchesProduction(route) && route.isDefault)
    || routes.find(matchesProduction)
    || null;
}

function getPlanningSlotWorkCenterId(slot = {}, step = null) {
  const resolvedStep = step || getPlanningSlotStep(slot);
  return mapLegacyWorkCenterId(
    slot?.workCenterId
    || slot?.routeWorkCenterId
    || resolvedStep?.planningWorkCenterId
    || resolvedStep?.workCenterId
    || resolvedStep?.departmentId
    || "",
  );
}

// This is the calendar identity normalizer used by views that render before
// the lazy Gantt runtime is available.  Keep it intentionally small and in
// sync with the Gantt resolver: an ephemeral SMT-line row is scheduled on
// its actual line, while ordinary ids only need legacy normalization.
function getPlanningCalendarWorkCenterId(workCenterId = "") {
  const mappedId = mapLegacyWorkCenterId(workCenterId);
  if (!mappedId.startsWith(SMT_LINE_WORKCENTER_PREFIX)) return mappedId;
  const lineId = mapLegacyWorkCenterId(mappedId.slice(SMT_LINE_WORKCENTER_PREFIX.length));
  return lineId || MES_SMT_WORK_CENTER_IDS[0] || mappedId;
}

function getPlanningSlotResourceId(slot = {}, step = null) {
  const resolvedStep = step || getPlanningSlotStep(slot);
  return String(slot?.resourceId || resolvedStep?.resourceId || "").trim();
}

function getPlanningSlotResource(slot = {}, step = null) {
  const resourceId = getPlanningSlotResourceId(slot, step);
  return resourceId ? getProductionResource(resourceId) || null : null;
}

function getPlanningTableSlotRows() {
  const stepById = new Map((planningState.routeSteps || []).map((step) => [step.id, step]));
  const warningsContext = getSlotWarnings(planningState);
  const slotWarningMap = warningsContext.slotWarningMap || {};

  return (planningState.slots || [])
    .map((slot) => {
      const step = stepById.get(slot.routeStepId) || null;
      // `step` is already indexed for this pass.  Reusing it avoids another
      // route-step scan per slot while the compact weekly period is loading.
      const route = getPlanningTableSlotRoute(slot, step);
      const routeId = route?.id || getSlotRouteId(slot, planningState);
      const task = route && step ? getRouteStepPlanningTask(route, step) : null;
      const status = getGanttSlotStatusView(slot);
      const workCenterId = getPlanningSlotWorkCenterId(slot, step);
      const workCenter = getWorkCenter(workCenterId) || getWorkCenter(slot.workCenterId) || null;
      const resource = getPlanningSlotResource(slot, step);
      const plannedStart = toDate(slot.plannedStart);
      const plannedEnd = toDate(slot.plannedEnd);
      const warningCount = (slotWarningMap[slot.id] || []).length;
      const quantity = normalizeQuantity(slot.quantity || route?.planningQuantity || 1, 1);

      return {
        id: slot.id,
        slot,
        step,
        route,
        task,
        status,
        warningCount,
        plannedStart,
        plannedEnd,
        quantity,
        unit: slot.unit || task?.unit || "шт.",
        routeLabel: getPlanningOrderObjectLabel(route) || route?.name || "Заказ-наряд",
        routeName: route?.name || routeId || "Маршрутная карта не найдена",
        taskLabel: task ? [task.number, task.title].filter(Boolean).join(" · ") : step?.specTaskName || "Общий маршрут",
        operationName: slot.operationName || step?.operationName || "Операция",
        workCenterId,
        workCenterLabel: workCenter?.name || workCenterId || "Участок не задан",
        resourceLabel: resource?.name || workCenter?.name || "Ресурс не назначен",
        workingMs: getSlotWorkingDurationMs(slot),
        calendarMs: getSlotCalendarDurationMs(slot),
      };
    })
    .sort((left, right) => (
      left.plannedStart - right.plannedStart
      || left.workCenterLabel.localeCompare(right.workCenterLabel, "ru")
      || left.operationName.localeCompare(right.operationName, "ru")
    ));
}

function getWeeklyPlanningPeriodBounds() {
  const weekStart = startOfWeek(new Date());
  const weekEnd = addMs(weekStart, 7 * DAY_MS);
  // The calendar week is defined in the operator's local timezone. Transport
  // its exact UTC instants, not bare dates (which the server would otherwise
  // interpret as UTC midnight and could drop an early-Monday Moscow slot).
  const fromAt = weekStart.toISOString();
  const toAt = weekEnd.toISOString();
  return { fromAt, toAt, key: `instant:${fromAt}|${toAt}` };
}

function getWeeklyPlanningTableSlotRows({ weekStart, weekEnd } = {}) {
  const fromAt = weekStart instanceof Date ? weekStart.toISOString() : "";
  const toAt = weekEnd instanceof Date ? weekEnd.toISOString() : "";
  const key = fromAt && toAt ? `instant:${fromAt}|${toAt}` : getWeeklyPlanningPeriodBounds().key;
  // An empty array is a valid server answer for the requested week. Only
  // null means the asynchronous period slice is not available yet, in which
  // case the legacy in-memory projection remains the safe fallback.
  if (weeklyPlanningPeriodState.key === key
    && Array.isArray(weeklyPlanningPeriodState.rows)
    && !weeklyPlanningPeriodState.preferLocal) {
    return weeklyPlanningPeriodState.rows;
  }
  return getPlanningTableSlotRows();
}

function renderPlanningTableInlineEmpty(title, text, iconName = "info") {
  return renderUiEmptyState({
    iconName,
    title,
    description: text,
  });
}

const routesRenderLoadingPage = () => renderUiModulePage({
  ariaLabel: "Справочники и маршруты",
  content: renderUiEmptyState({ title: "Загружаем модуль", description: "Экран откроется автоматически." }),
});
let getRouteTaskTypeLabel = () => "";
let getWorkOrderPrintPackageViewModel = () => null;
let renderDirectoryPage = () => routesRenderLoadingPage();
let renderRoutePrintPreviewModal = () => "";
let renderRouteTreeCell = () => "";
let renderRoutesPage = () => routesRenderLoadingPage();
let renderWorkOrderPrintPackageModal = () => "";
let routesRenderModuleLoad = null;
let routesRenderModuleError = null;
function initializeRoutesRenderModule(factory) {
  ({
    getWorkOrderPrintPackageViewModel,
    getRouteTaskTypeLabel,
    renderDirectoryPage,
    renderRoutePrintPreviewModal,
    renderRouteTreeCell,
    renderRoutesPage,
    renderWorkOrderPrintPackageModal,
  } = factory({
  MAIN_ROUTE_TASK_ID,
  distance,
  escapeAttribute,
  escapeHtml,
  formatDateTimeShort,
  formatReportNumber,
  formatShiftWorkOrderPersonName: (...args) => formatShiftWorkOrderPersonName(...args),
  getActiveRouteForModule,
  getActiveSpecificationForModule,
  getDefaultOperationMapItemForRouteKind,
  getDirectoryColumnFilterOptions: (...args) => appEventsService.getDirectoryColumnFilterOptions(...args),
  getDirectoryColumnFilterValues: (...args) => appEventsService.getDirectoryColumnFilterValues(...args),
  getDirectoryData,
  getDirectoryHealth: (...args) => appEventsService.getDirectoryHealth(...args),
  getOperationMapItem,
  getOperationMapRows,
  getOperationRouteWorkCenterId,
  getPlanningBoardsPerPanel,
  getPlanningOrderObjectLabel,
  getPlanningRouteQuantity,
  getPlanningRouteTransferSummary,
  getPlanningShiftDateLabel,
  getProductionResourceWorkCenterId,
  getProject,
  getProjectDisplayName,
  getResourceBaseCph,
  getRouteBindingContext,
  getRouteBindingModeForSelection,
  getRouteBindingOptions,
  getRouteBomList,
  getRouteCardViewModel,
  getRouteDocumentKind,
  getRouteDocumentKindLabel,
  getRouteDocumentKindShortLabel,
  getRouteGenerationRoot,
  getRouteInstructionWorkCenters,
  getRouteLineageSubjectName,
  getRouteLinkedChildDocuments,
  getRouteModuleSelectionName,
  getRouteModuleSelectionValue,
  getRouteModuleStats,
  getRouteParentRoute,
  getRouteProductionContext,
  getRouteProductionId,
  getRouteRootRoute,
  getRouteSpecification, getRoutesForModule,
  getRouteStepEffectiveQuantityMultiplier,
  getRouteStepLaborSnapshot,
  getRouteStepPlanningCandidateWorkCenterIds,
  getRouteStepPlanningTask,
  getRouteStepQuantityForBatch,
  getRouteStepTaskId,
  getRouteStepsForModule,
  getRouteStepsForTask,
  getRouteTasksForModule,
  getSelectedDirectoryRowIndex: (...args) => appEventsService.getSelectedDirectoryRowIndex(...args),
  getShiftMasterEmployee,
  getShiftWorkOrderJournalViewModel: (...args) => getShiftWorkOrderJournalViewModel(...args),
  getSmtLineConfigurations,
  getVisibleDirectoryGroups,
  getVisibleDirectorySections,
  getWorkCenter,
  getWorkCenterUnitsPerHour,
  getWorkOrderViewModel,
  getStatusAuditInfo,
  getStatusImpactMap,
  getStatusImpactParts,
  getStatusLifecycleModules,
  getStatusNextDocumentView,
  getStatusTransitionView,
  formatDirectoryCell: (...args) => appEventsService.formatDirectoryCell(...args),
  icon,
  isManufacturingOutputReceiptRouteStep,
  isSmtOperationWorkCenter,
  isWarehouseWorkCenterId,
  joinUiClasses,
  mapLegacyWorkCenterId,
  normalizeBoardsPerPanel,
  normalizeDirectoryFilterSearch: (...args) => appEventsService.normalizeDirectoryFilterSearch(...args),
  normalizeQuantity,
  normalizeRouteBindingValue,
  normalizeRouteStepCalculationFields,
  normalizeShiftMasterBoardQuantity: (...args) => (
    typeof normalizeShiftMasterBoardQuantity === "function"
      ? normalizeShiftMasterBoardQuantity(...args)
      : normalizeQuantity(args[0])
  ),
  renderDenseInlineSelect,
  renderRouteStepFlowEditor, renderRouteStepFlowToggle, renderRouteStepFlowPanelRow, renderRouteStepLaborToggle, renderRouteStepLaborPanelRow,
  renderRouteTaskOutputHint,
  renderDirectoryEditorModal: (...args) => renderDirectoryEditorModal(...args),
  renderDirectoryReaderModal: (...args) => renderDirectoryReaderModal(...args),
  renderUiActionButton,
  renderUiFormActions,
  renderUiFormField,
  renderUiFormGrid,
  renderUiModalShell,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiModuleSidebar, renderUiSidebarItem, renderUiPanelHead,
  renderUiPanel, renderUiPanelBody, renderUiStatusToken, renderUiTableWrap, planningState, ui,
  }));
}

function ensureRoutesRenderModule() {
  if (routesRenderModuleLoad || routesRenderModuleError) return routesRenderModuleLoad;
  // The directory renderer consumes a synchronous operation helper from the
  // route event runtime. Load both chunks before publishing the renderer so a
  // cold directory visit never renders against an uninitialized event facade.
  routesRenderModuleLoad = Promise.all([
    import("./modules/routes/render.js"),
    ensureRoutesEvents(),
  ])
    .then(([{ createRoutesRenderModule }]) => {
      initializeRoutesRenderModule(createRoutesRenderModule);
      if (["directories", "routes"].includes(ui.activeModule)) render();
    })
    .catch((error) => {
      routesRenderModuleError = error;
      console.error("[MES routes] module load failed", error);
      if (["directories", "routes"].includes(ui.activeModule)) render();
    });
  return routesRenderModuleLoad;
}

let getShiftWorkOrderRows, getShiftMasterBoardSlotRows, groupShiftRowsByWorkCenter, groupShiftRowsByOrder, getDispatchWindow, getShiftWorkbenchWindow, getShiftWindowDayCount, renderShiftWindowRuler, normalizeDateInput, setShiftWorkbenchDate, moveShiftWorkbenchDate, setShiftWorkbenchToday, renderShiftCalendarControl, isSlotInsideDispatchWindow, getDispatchSlotTone, getDispatchSlotWindowStyle, buildDispatchWorkCenterRows, buildDispatchRouteRows, buildDispatchSignals, getDispatchCheckpointReferenceTime, buildDispatchCheckpoints, buildDispatchBoardData, normalizeShiftMasterBoardQuantity, getShiftMasterBoardAssignment, getShiftMasterBoardFact, getShiftMasterBoardAssignmentQuantity, getShiftMasterBoardRowById, getShiftMasterBoardNextRouteStep, getShiftMasterBoardTransferTarget, getShiftMasterBoardCarryoverForSource, buildShiftMasterBoardTransferContract, buildShiftMasterBoardSheetContract, getShiftMasterBoardLaborMinutesPerUnit, getShiftMasterBoardTimesheetCapacity, getShiftMasterBoardLaneId, getShiftMasterBoardRow, getShiftMasterBoardGroupKey, groupShiftMasterBoardRows, getShiftMasterBoardWeek, getShiftMasterBoardCarryoverRows, getShiftMasterBoardFallbackRows, getShiftMasterBoardModel, getShiftMasterBoardExecutorLoadMap, renderShiftMasterBoardPage, renderShiftMasterBoardTopControls, renderShiftMasterBoardKpi, renderShiftMasterBoardLanes, renderShiftMasterBoardLane, renderShiftMasterBoardCard, renderShiftMasterBoardDetail, renderShiftMasterBoardTaskContext, renderShiftMasterBoardInlineSummary, renderShiftMasterBoardSummaryCell, getShiftMasterBoardRouteChain, renderShiftMasterBoardRouteChain, renderShiftMasterBoardCoverage, renderShiftMasterBoardEmployeeOptions, renderShiftMasterBoardAvailableEmployeeLoadbar, renderShiftMasterBoardAssignment, renderShiftMasterBoardDocument, renderShiftMasterBoardSheetModal, renderShiftMasterBoardActionModal, getShiftMasterDemoLanes, getShiftMasterRowOrderLabel, getShiftMasterRowRouteLabel, getShiftMasterRowRoutePartLabel, readShiftMasterBoardAssignmentPanel, readShiftMasterBoardCurrentAssignmentPatch, mergeShiftMasterBoardIssueAssignment, persistShiftMasterBoardAssignmentInput, updateShiftMasterBoardAvailableQuantityPreview, updateShiftMasterBoardLane, canMoveShiftMasterBoardCardToLane, moveShiftMasterBoardCardToLane, saveShiftMasterBoardAssignment, markShiftMasterBoardSheetPrinted, saveShiftMasterBoardFact, removeShiftMasterBoardCarryoverForSource, createShiftMasterBoardCarryover, bindShiftMasterBoardEvents;
let getPlanningWorkItemId, parsePlanningWorkItemId, getPlanningWorkItemSet, getDefaultPlanningWorkItem, getPlanningActiveWorkItem;
function initializeShiftMasterBoardModule(factory) {
  ({
    getShiftWorkOrderRows,
    getShiftMasterBoardSlotRows,
    groupShiftRowsByWorkCenter,
    groupShiftRowsByOrder,
    getDispatchWindow,
    getShiftWorkbenchWindow,
    getShiftWindowDayCount,
    renderShiftWindowRuler,
    normalizeDateInput,
    setShiftWorkbenchDate,
    moveShiftWorkbenchDate,
    setShiftWorkbenchToday,
    renderShiftCalendarControl,
    isSlotInsideDispatchWindow,
    getDispatchSlotTone,
    getDispatchSlotWindowStyle,
    buildDispatchWorkCenterRows,
    buildDispatchRouteRows,
    buildDispatchSignals,
    getDispatchCheckpointReferenceTime,
    buildDispatchCheckpoints,
    buildDispatchBoardData,
    normalizeShiftMasterBoardQuantity,
    getShiftMasterBoardAssignment,
    getShiftMasterBoardFact,
    getShiftMasterBoardAssignmentQuantity,
    getShiftMasterBoardRowById,
    getShiftMasterBoardNextRouteStep,
    getShiftMasterBoardTransferTarget,
    getShiftMasterBoardCarryoverForSource,
    buildShiftMasterBoardTransferContract,
    buildShiftMasterBoardSheetContract,
    getShiftMasterBoardLaborMinutesPerUnit,
    getShiftMasterBoardTimesheetCapacity,
    getShiftMasterBoardLaneId,
    getShiftMasterBoardRow,
    getShiftMasterBoardGroupKey,
    groupShiftMasterBoardRows,
    getShiftMasterBoardWeek,
    getShiftMasterBoardCarryoverRows,
    getShiftMasterBoardFallbackRows,
    getShiftMasterBoardModel,
    getShiftMasterBoardExecutorLoadMap,
    renderShiftMasterBoardPage,
    renderShiftMasterBoardTopControls,
    renderShiftMasterBoardKpi,
    renderShiftMasterBoardLanes,
    renderShiftMasterBoardLane,
    renderShiftMasterBoardCard,
    renderShiftMasterBoardDetail,
    renderShiftMasterBoardTaskContext,
    renderShiftMasterBoardInlineSummary,
    renderShiftMasterBoardSummaryCell,
    getShiftMasterBoardRouteChain,
    renderShiftMasterBoardRouteChain,
    renderShiftMasterBoardCoverage,
    renderShiftMasterBoardEmployeeOptions,
    renderShiftMasterBoardAvailableEmployeeLoadbar,
    renderShiftMasterBoardAssignment,
    renderShiftMasterBoardDocument,
    renderShiftMasterBoardSheetModal,
    renderShiftMasterBoardActionModal,
    getShiftMasterDemoLanes,
    getShiftMasterRowOrderLabel,
    getShiftMasterRowRouteLabel,
    getShiftMasterRowRoutePartLabel,
    readShiftMasterBoardAssignmentPanel,
    readShiftMasterBoardCurrentAssignmentPatch,
    mergeShiftMasterBoardIssueAssignment,
    persistShiftMasterBoardAssignmentInput,
    updateShiftMasterBoardAvailableQuantityPreview,
    updateShiftMasterBoardLane,
    canMoveShiftMasterBoardCardToLane,
    moveShiftMasterBoardCardToLane,
    saveShiftMasterBoardAssignment,
    markShiftMasterBoardSheetPrinted,
    saveShiftMasterBoardFact,
    removeShiftMasterBoardCarryoverForSource,
    createShiftMasterBoardCarryover,
    bindShiftMasterBoardEvents,
  } = factory({
  addMs,
  app,
  attributes: {},
  bindGenericModalCloseEvents,
  bindShiftCalendarEvents,
  buildBacklogItems,
  buildMesDocumentContract,
  calculateProjectProgress,
  candidate: null,
  canSelectMaster: false,
  center: null,
  className: "",
  day: "",
  DAY_MS,
  defaultUiState,
  deviationComment: "",
  deviationNotes: [],
  employeeId: "",
  enrichShiftMasterEmployeesWithTimesheet,
  escapeAttribute,
  escapeHtml,
  fallback: null,
  field: "",
  formatDate,
  formatDateTimeShort,
  formatReportNumber,
  fromDateInput,
  getDispatchFact,
  getDispatchFactStatusConfig,
  getBatch,
  getEarliestPlannedSlotStart,
  getGanttSlotStatusView,
  getGanttSlotViewModel,
  getMesFlowTransitionView,
  getMesStatusView,
  getPlanningOrderObjectLabel,
  getPlanningRouteLaborReadiness,
  getPlanningRouteQuantity,
  getPlanningShiftSlotTimeLabelForWindow,
  getPlanningWorkCenters,
  getProject,
  getProjectDeadlineState,
  getProjectDisplayName,
  getRoutePlanningContext,
  getRouteStepPlanningTask,
  getRouteStepQuantityForBatch,
  getRouteStepSelectedPlanningWorkCenterId,
  getShiftMasterAssignableEmployees,
  getShiftMasterAssignment,
  getShiftMasterBoardAccessContext,
  getShiftMasterBoardRiskLabel,
  getShiftMasterEmployee,
  getShiftMasterOwnerProfileForWorkCenter,
  getShiftMasterProfile,
  getShiftMasterProfiles,
  getShiftMasterResourceOptions,
  getShiftRowId,
  getShiftRowWorkCenterId,
  getShiftSlotPlannedQuantity,
  getSlotDurationHours,
  getSlotGanttWorkCenterId: (slot) => getPlanningSlotWorkCenterId(slot),
  getSlotPlanningOrderId,
  getSlotRoute: (slot) => getPlanningSlotRoute(slot),
  getSlotRouteId,
  getSlotWarnings,
  getTimesheetAvailabilityForShiftMasterEmployee,
  getWorkCenter,
  getWorkCenterCapacity,
  getWorkingDurationBetween: (...args) => (
    typeof planningCoreService.getWorkingDurationBetween === "function"
      ? planningCoreService.getWorkingDurationBetween(...args)
      : Math.max(0, new Date(args[2]).getTime() - new Date(args[1]).getTime())
  ),
  getWorkOrderPlanningStatusValue,
  icon,
  iconName: "",
  id: "",
  input: null,
  isActive: false,
  isGanttSlotActive,
  isGanttSlotCompleted,
  isGanttSlotProblemStatus,
  isGanttSlotStatus,
  isManufacturingOutputReceiptSlot,
  isSmtOperationWorkCenter,
  isSmtStep: false,
  isWorkOrderPlanningCanceled,
  item: null,
  kind: "",
  mapLegacyWorkCenterId,
  message: "",
  month: "",
  name: "",
  normalizeBoardsPerPanel,
  normalizeDispatchExecutorCount,
  normalizeDispatchLaborMinutes,
  normalizePlainRecord,
  normalizePlanningLaborPositiveNumber,
  normalizeQuantity,
  normalizeUiTone,
  normalizeShiftMasterBoardFocus,
  normalizeShiftMasterBoardLane,
  normalizeShiftMasterBoardRiskReason,
  normalizeShiftMasterBoardSwimlane,
  normalizeShiftMasterExecutorQuantity,
  normalizeShiftMasterExecutors,
  normalizeShiftMasterFactQuantity,
  note: "",
  notifySaveSuccess,
  onShiftMasterBoardAssignmentSaved: (...args) => mirrorShiftMasterBoardAssignmentToServer(...args),
  onShiftMasterBoardFactSaved: (...args) => mirrorShiftMasterBoardFactToServer(...args),
  onShiftMasterBoardCarryoverCreated: (...args) => mirrorShiftMasterBoardCarryoverToServer(...args),
  onShiftMasterBoardCarryoverRemoved: (...args) => mirrorShiftMasterBoardCarryoverRemovalToServer(...args),
  operationName: "",
  patch: null,
  persistUiState,
  profile: null,
  rawStatus: "",
  recoverPlanningStateFromStorageIfRuntimeEmpty,
  render,
  renderUiActionButton,
  renderUiEmptyState,
  renderUiModalFrame,
  renderUiModalShell,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiPanel,
  renderUiPanelBody,
  renderUiPanelHead,
  renderUiSystemState,
  renderUiStatusToken,
  resource: null,
  resourceId: "",
  resourceLabel: "",
  routeStepRequiresManualPlanningLine,
  rowId: "",
  SHIFT_MASTER_BOARD_LANES,
  SHIFT_WORKBENCH_WINDOW_DAYS,
  shiftMasterProfileOwnsWorkCenter,
  slackMs: 0,
  source: null,
  sourceId: "",
  startOfDay,
  stepId: "",
  style: "",
  taskLabel: "",
  tasks: [],
  text: "",
  title: "",
  toDate,
  toDateInput,
  transferSummary: null,
  type: "",
  value: "",
  version: "",
  windowsOverlap,
  getUi: () => ui,
  getPlanningState: () => planningState,
  getDirectoryState: () => directoryState,
  }));
}

function renderShiftMasterBoardShellState({ title, description }) {
  return renderMesModulePatternPage({
    moduleId: "shiftMasterBoard",
    header: renderUiModuleHeader({
      eyebrow: "Оперативное управление",
      title: "Мастерская",
      description,
      className: "shift-master-board-header is-compact",
    }),
    content: renderUiEmptyState({ title, description }),
  });
}

renderShiftMasterBoardPage = () => renderShiftMasterBoardShellState({
  title: "Загружаем мастерскую",
  description: "Рабочее пространство откроется автоматически.",
});
renderShiftMasterBoardSheetModal = () => "";
renderShiftMasterBoardActionModal = () => "";
markShiftMasterBoardSheetPrinted = () => null;
bindShiftMasterBoardEvents = () => {};
let shiftMasterBoardModuleLoad = null;
let shiftMasterBoardModuleError = null;

function ensureShiftMasterBoardModule() {
  if (shiftMasterBoardModuleLoad || shiftMasterBoardModuleError) return shiftMasterBoardModuleLoad;
  shiftMasterBoardModuleLoad = import("./modules/shift_master_board/render.js")
    .then(({ createShiftMasterBoardModule }) => {
      initializeShiftMasterBoardModule(createShiftMasterBoardModule);
    if (["shiftMasterBoard", "authSessionPrototype"].includes(ui.activeModule) || ui.activeModule === "shiftWorkOrders") {
      render({ skipRememberScroll: true });
    }
    })
    .catch((error) => {
      shiftMasterBoardModuleError = error;
      console.error("[MES shift-master-board] module load failed", error);
      if (ui.activeModule === "shiftMasterBoard") render({ skipRememberScroll: true });
    });
  return shiftMasterBoardModuleLoad;
}

const shiftWorkOrdersLoadingState = () => renderMesModulePatternPage({
  moduleId: "shiftWorkOrders",
  content: renderUiEmptyState({ title: "Загружаем модуль", description: "Экран откроется автоматически." }),
});
let bindShiftWorkOrdersEvents = () => {};
let formatShiftWorkOrderPersonName = (person = {}) => String(person?.name || person?.fullName || person?.id || "—");
let getShiftWorkOrderJournalViewModel = () => ({ rows: [], totals: {} });
let renderShiftWorkOrderIssuePhotoModal = () => "";
let renderShiftWorkOrderPrintPreviewModal = () => "";
let renderShiftWorkOrdersPage = () => shiftWorkOrdersLoadingState();
let shiftWorkOrdersModuleLoad = null;
let shiftWorkOrdersModuleError = null;
function initializeShiftWorkOrdersModule(factory) {
  ({
    bindShiftWorkOrdersEvents,
    formatShiftWorkOrderPersonName,
    getShiftWorkOrderJournalViewModel,
    renderShiftWorkOrderIssuePhotoModal,
    renderShiftWorkOrderPrintPreviewModal,
    renderShiftWorkOrdersPage,
  } = factory({
  bindGenericModalCloseEvents,
  buildShiftMasterBoardSheetContract: (...args) => typeof buildShiftMasterBoardSheetContract === "function" ? buildShiftMasterBoardSheetContract(...args) : ({}),
  buildShiftMasterBoardTransferContract: (...args) => typeof buildShiftMasterBoardTransferContract === "function" ? buildShiftMasterBoardTransferContract(...args) : ({}),
  escapeAttribute,
  escapeHtml,
  formatDateTimeShort,
  getApp: () => app,
  getShiftMasterBoardAssignmentQuantity: (...args) => typeof getShiftMasterBoardAssignmentQuantity === "function" ? getShiftMasterBoardAssignmentQuantity(...args) : 0,
  getShiftMasterBoardModel: (...args) => typeof getShiftMasterBoardModel === "function" ? getShiftMasterBoardModel(...args) : ({ rows: [], allRows: [] }),
  getShiftMasterEmployee,
  // These reports are owned by the session renderer. Keep them late-bound so
  // the workshop never captures an obsolete implementation during bootstrap.
  getShiftWorkOrderIssueLookupKeys: (...args) => getShiftWorkOrderIssueLookupKeys(...args),
  getShiftWorkOrderIssueReports: (...args) => getShiftWorkOrderIssueReports(...args),
  getShiftWorkOrderIssueSummary: (...args) => getShiftWorkOrderIssueSummary(...args),
  getShiftWorkOrderReportPhotoItems: (...args) => getShiftWorkOrderReportPhotoItems(...args),
  getSlotPlanningOrderId,
  getUi: () => ui,
  getWorkOrderPrintPackageViewModel: (...args) => getWorkOrderPrintPackageViewModel(...args),
  icon,
  normalizePlainRecord,
  normalizeShiftMasterBoardQuantity: (value) => typeof normalizeShiftMasterBoardQuantity === "function" ? normalizeShiftMasterBoardQuantity(value) : Math.max(0, Number(value || 0) || 0),
  persistUiState,
  render,
  renderPreservingModuleScroll,
  renderRouteTreeCell: (...args) => renderRouteTreeCell(...args),
  renderUiActionButton,
  renderUiEmptyState,
  renderUiModalFrame,
  renderUiModalShell,
  renderUiModulePage,
  renderUiPanel,
  renderUiPanelBody,
  renderUiStatusToken,
  renderUiTableWrap,
  toDate,
  toDateInput,
  }));
}

function ensureShiftWorkOrdersModule() {
  if (shiftWorkOrdersModuleLoad) return shiftWorkOrdersModuleLoad;
  shiftWorkOrdersModuleLoad = import("./modules/shift_work_orders/render.js")
    .then(({ createShiftWorkOrdersModule }) => {
      initializeShiftWorkOrdersModule(createShiftWorkOrdersModule);
      if (ui.activeModule === "shiftWorkOrders") render();
    })
    .catch((error) => {
      shiftWorkOrdersModuleError = error;
      console.error("Не удалось загрузить модуль заказ-нарядов", error);
      if (ui.activeModule === "shiftWorkOrders") render();
    });
  return shiftWorkOrdersModuleLoad;
}

let weeklyProductionControlRuntimeInstance = null;
let weeklyProductionControlRuntimeLoad = null;
let weeklyProductionControlRuntimeError = null;
let planningPeriodReadModel = null;
let buildWeeklyPlanningPeriodRows = null;
let buildWeeklyPlanningPeriodRowsFromCompact = null;
let weeklyPlanningRowsEquivalent = null;
let weeklyPlanningPeriodModuleLoad = null;
let weeklyPlanningPeriodState = {
  key: "",
  rows: null,
  loading: false,
  stale: false,
  // A local planning write remains visible until the bounded server answer
  // proves it contains the same rows. A stale HTTP 304 must not hide a
  // just-saved compatibility-state change.
  preferLocal: false,
  epoch: 0,
  error: "",
  fallbackReason: "",
};
let weeklyPlanningPeriodRefreshTimer = null;

const weeklyProductionControlLoadingInstance = Object.freeze({
  formatWeeklyProductionControlPercent: (value = 0) => weeklyProductionControlRuntimeInstance
    ? weeklyProductionControlRuntimeInstance.formatWeeklyProductionControlPercent(value)
    : `${Math.round(Number(value || 0))}%`,
  formatWeeklyProductionControlQuantity: (value = 0, unit = "шт.") => weeklyProductionControlRuntimeInstance
    ? weeklyProductionControlRuntimeInstance.formatWeeklyProductionControlQuantity(value, unit)
    : `${Number(value || 0).toLocaleString("ru-RU")} ${unit}`,
  getWeeklyProductionControlModel: () => weeklyProductionControlRuntimeInstance
    ? weeklyProductionControlRuntimeInstance.getWeeklyProductionControlModel()
    : ({ rows: [], totals: {} }),
  renderWeeklyProductionControlPage: () => weeklyProductionControlRuntimeInstance
    ? weeklyProductionControlRuntimeInstance.renderWeeklyProductionControlPage()
    : renderMesModulePatternPage({
    moduleId: "weeklyProductionControl",
    header: {
      title: "Контроль недели",
      description: weeklyProductionControlRuntimeError
        ? "Не удалось загрузить модуль контроля недели. Обновите страницу."
        : "Загружаем данные контроля недели…",
    },
    content: renderUiEmptyState({
      title: weeklyProductionControlRuntimeError ? "Модуль недоступен" : "Загружаем модуль",
      description: weeklyProductionControlRuntimeError
        ? "Обновите страницу. Если ошибка повторится, передайте время её появления в поддержку."
        : "Экран откроется автоматически.",
    }),
    }),
  bindWeeklyProductionControlEvents: () => weeklyProductionControlRuntimeInstance?.bindWeeklyProductionControlEvents(),
});

// Weekly control is intentionally usable before either Gantt or the workshop
// module has been visited.  Keep its read-only fact projection here instead of
// capturing helpers from their lazy runtimes during application bootstrap.
function normalizeWeeklyControlQuantity(value = 0) {
  return Math.max(0, Number(value || 0) || 0);
}

function getWeeklyControlLinkedRecordEntries(source = {}, slotId = "") {
  if (!source || !slotId) return [];
  const prefix = `${slotId}::`;
  return Object.entries(source && typeof source === "object" ? source : {})
    .filter(([key, record]) => {
      const recordSlotId = String(record?.slotId || "");
      return key === slotId
        || key.startsWith(prefix)
        || recordSlotId === slotId
        || recordSlotId.startsWith(prefix);
    })
    .map(([key, record]) => [record?.slotId || key, record])
    .filter(([, record]) => Boolean(record));
}

function isWeeklyControlFactRecordReported(record = {}) {
  const status = String(record.status || "").trim();
  return normalizeWeeklyControlQuantity(record.actualQuantity || 0) > 0
    || normalizeWeeklyControlQuantity(record.defectQuantity || 0) > 0
    || Boolean(String(record.updatedAt || record.factUpdatedAt || "").trim())
    || (status && status !== "not_reported");
}

function getWeeklyControlBoardFactEntries(slotId = "") {
  return getWeeklyControlLinkedRecordEntries(normalizePlainRecord(ui.shiftMasterBoardFacts), slotId)
    .map(([key, record]) => {
      const actualQuantity = normalizeWeeklyControlQuantity(record?.actualQuantity || 0);
      const defectQuantity = normalizeWeeklyControlQuantity(record?.defectQuantity || 0);
      const linkedSlotId = String(record?.slotId || key || "").trim();
      return [key, {
        slotId: linkedSlotId,
        actualQuantity: Math.max(0, actualQuantity - defectQuantity),
        defectQuantity,
        status: actualQuantity > defectQuantity ? "accepted" : "not_reported",
        comment: String(record?.comment || ""),
        deviationComment: String(record?.deviationComment || ""),
        deviationNotes: Array.isArray(record?.deviationNotes) ? record.deviationNotes : [],
        updatedAt: String(record?.updatedAt || ""),
      }];
    });
}

function getWeeklyControlAssignments(slotId = "") {
  const masterEntries = getWeeklyControlLinkedRecordEntries(planningState.shiftMasterAssignments || {}, slotId);
  const boardEntries = getWeeklyControlLinkedRecordEntries(normalizePlainRecord(ui.shiftMasterBoardAssignments), slotId);
  const boardKeys = new Set(boardEntries.map(([key]) => key));
  const hasBoardEntries = boardEntries.length > 0;
  return [
    ...masterEntries
      .filter(([key]) => !boardKeys.has(key) && !(hasBoardEntries && key === slotId))
      .map(([, record]) => record),
    ...boardEntries.map(([, record]) => record),
  ].filter(Boolean);
}

function getWeeklyControlAuthSessionFactEntries(slotId = "") {
  if (!slotId) return [];
  const assignmentStore = normalizePlainRecord(ui.shiftMasterBoardAssignments);
  const drafts = normalizePlainRecord(ui.authSessionFactDrafts);
  const findAssignment = (rowId = "") => {
    if (!rowId) return {};
    const direct = normalizePlainRecord(assignmentStore[rowId]);
    if (Object.keys(direct).length) return direct;
    return Object.values(assignmentStore).find((assignment) => (
      assignment
      && (
        assignment.sourceRowId === rowId
        || assignment.slotId === rowId
        || assignment.sheetContract?.rowId === rowId
        || assignment.sheetContract?.sourceSlotId === rowId
      )
    )) || {};
  };

  return Object.entries(drafts).map(([taskId, draft]) => {
    const normalizedDraft = normalizePlainRecord(draft);
    if (!normalizedDraft.updatedAt) return null;
    const normalizedTaskId = String(taskId || "").trim();
    const separatorIndex = normalizedTaskId.lastIndexOf("::");
    const rowId = separatorIndex > 0 ? normalizedTaskId.slice(0, separatorIndex) : normalizedTaskId;
    const assignment = findAssignment(rowId);
    const linkedSlotId = String(
      assignment.slotId
      || assignment.sheetContract?.sourceSlotId
      || assignment.transferContract?.sourceSlotId
      || rowId,
    ).trim();
    const matchesSlot = linkedSlotId === slotId
      || rowId === slotId
      || normalizedTaskId.startsWith(`${slotId}::`);
    if (!matchesSlot) return null;
    const actualQuantity = normalizeWeeklyControlQuantity(normalizedDraft.actualQuantity || 0);
    const defectQuantity = normalizeWeeklyControlQuantity(normalizedDraft.defectQuantity || 0);
    return [taskId, {
      slotId: linkedSlotId || slotId,
      actualQuantity: Math.max(0, actualQuantity - defectQuantity),
      defectQuantity,
      status: "accepted",
      comment: "Факт внесен с рабочего стола исполнителя",
      deviationComment: String(normalizedDraft.deviationComment || ""),
      deviationNotes: String(normalizedDraft.deviationComment || "").trim() ? [{
        taskId,
        employeeName: "Исполнитель",
        text: String(normalizedDraft.deviationComment || "").trim(),
        createdAt: String(normalizedDraft.updatedAt || ""),
        deviationPercent: 0,
      }] : [],
      updatedAt: String(normalizedDraft.updatedAt || ""),
    }];
  }).filter(Boolean);
}

function createWeeklyProductionControlRuntimeInstance(factory) {
  return factory({
  DAY_MS,
  addMs,
  escapeAttribute,
  escapeHtml,
  formatDate,
  formatDateTimeShort,
  formatShiftWorkOrderPersonName: (...args) => formatShiftWorkOrderPersonName(...args),
  formatShortDate,
  getApp: () => app,
  getAuthSessionFactEntriesForGanttSlot: getWeeklyControlAuthSessionFactEntries,
  getGanttLinkedRecordEntries: getWeeklyControlLinkedRecordEntries,
  getPlanningState: () => planningState,
  getPlanningTableSlotRows: getWeeklyPlanningTableSlotRows,
  getProductionStructureMatrixRuntimeOverrides: () => getProductionStructureMatrixRuntimeOverrides(),
  getProductionStructureResources,
  getProductionStructureWorkCenters,
  getShiftMasterAssignmentsForGanttSlot: getWeeklyControlAssignments,
  getShiftMasterBoardFactEntriesForGanttSlot: getWeeklyControlBoardFactEntries,
  getShiftWorkOrderIssueReports: (...args) => getShiftWorkOrderIssueReports(...args),
  getUi: () => ui,
  getWeekNumber,
  isGanttFactRecordReported: isWeeklyControlFactRecordReported,
  mapLegacyWorkCenterId,
  normalizeLookupText,
  normalizePlainRecord,
  normalizeShiftMasterBoardQuantity: normalizeWeeklyControlQuantity,
  normalizeShiftMasterFactQuantity: normalizeWeeklyControlQuantity,
  renderPlanningTableInlineEmpty,
  renderMesModulePatternPage,
  renderUiEmptyState,
  renderUiMetricGrid,
  renderUiPanel,
  renderUiPanelBody,
  renderUiStatusToken,
  renderUiTableWrap,
  startOfDay,
  startOfWeek,
  toDate,
  toDateInput,
  });
}

function ensureWeeklyPlanningPeriodModule() {
  if (planningPeriodReadModel && buildWeeklyPlanningPeriodRows && buildWeeklyPlanningPeriodRowsFromCompact) return Promise.resolve(true);
  if (weeklyPlanningPeriodModuleLoad) return weeklyPlanningPeriodModuleLoad;
  weeklyPlanningPeriodModuleLoad = Promise.all([
    import("./modules/domain_api/planning_period_read_model.js"),
    import("./modules/weekly_production_control/planning_period_rows.js"),
  ]).then(([
    { createPlanningPeriodReadModel },
    {
      buildWeeklyPlanningPeriodRows: buildRows,
      buildWeeklyPlanningPeriodRowsFromCompact: buildCompactRows,
      weeklyPlanningRowsEquivalent: compareRows,
    },
  ]) => {
    planningPeriodReadModel = createPlanningPeriodReadModel({ view: "weekly" });
    buildWeeklyPlanningPeriodRows = buildRows;
    buildWeeklyPlanningPeriodRowsFromCompact = buildCompactRows;
    weeklyPlanningRowsEquivalent = compareRows;
    return true;
  }).catch((error) => {
    weeklyPlanningPeriodModuleLoad = null;
    weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, loading: false, error: error?.message || "Weekly planning period module is unavailable" };
    return false;
  });
  return weeklyPlanningPeriodModuleLoad;
}

function getWeeklyPlanningPeriodLookups() {
  const overrides = getProductionStructureMatrixRuntimeOverrides();
  const workCentersById = new Map(getProductionStructureWorkCenters(overrides)
    .map((item) => [String(item?.id || ""), item]));
  const resourcesById = new Map(getProductionStructureResources(overrides)
    .map((item) => [String(item?.id || ""), item]));
  return {
    getWorkCenter: (id) => workCentersById.get(String(id || "")) || null,
    getResource: (id) => resourcesById.get(String(id || "")) || null,
  };
}

// The compact PostgreSQL weekly transport intentionally does not carry the
// legacy route/operation graph. It does carry the small original slot envelope
// needed here, so reuse only already-loaded planning/product resolvers for the
// visible work center, resource and task unit. This must not touch the lazy
// Gantt runtime: weekly control is deliberately usable before the Gantt chunk
// has loaded.
function resolveWeeklyCompactSlotPresentation(slot = {}) {
  const step = getPlanningSlotStep(slot);
  const route = getPlanningSlotRoute(slot, planningState);
  const task = route && step ? getRouteStepPlanningTask(route, step) : null;
  const workCenterId = getPlanningSlotWorkCenterId(slot, step);
  const workCenter = getWorkCenter(workCenterId) || getWorkCenter(slot.workCenterId) || null;
  const resourceId = getPlanningSlotResourceId(slot, step);
  const resource = getPlanningSlotResource(slot, step);
  return {
    workCenterId,
    workCenter,
    resource,
    resourceId: String(resource?.id || resourceId || ""),
    unit: String(slot.unit || task?.unit || "шт."),
  };
}

function clearWeeklyPlanningPeriodRefreshTimer() {
  if (weeklyPlanningPeriodRefreshTimer !== null) clearTimeout(weeklyPlanningPeriodRefreshTimer);
  weeklyPlanningPeriodRefreshTimer = null;
}

function scheduleWeeklyPlanningPeriodRefresh(bounds) {
  clearWeeklyPlanningPeriodRefreshTimer();
  if (ui?.activeModule !== "weeklyProductionControl") return;
  const status = planningPeriodReadModel?.getStatus?.(bounds) || {};
  const delay = Math.max(5_000, Number(status.freshUntil || 0) - Date.now());
  weeklyPlanningPeriodRefreshTimer = setTimeout(() => {
    weeklyPlanningPeriodRefreshTimer = null;
    if (ui?.activeModule !== "weeklyProductionControl") return;
    weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, stale: true };
    hydrateWeeklyPlanningPeriod();
  }, delay);
}

function invalidateWeeklyPlanningPeriod() {
  weeklyPlanningPeriodState = {
    ...weeklyPlanningPeriodState,
    stale: true,
    preferLocal: true,
    epoch: Number(weeklyPlanningPeriodState.epoch || 0) + 1,
  };
  // Service facades publish their current state after a call, including
  // read-only helpers used while a page is rendering.  A visible weekly page
  // must become stale, but it must not synchronously re-enter its own render
  // from that publication.
  const canRefreshVisibleWeeklyPage = ui?.activeModule === "weeklyProductionControl"
    && Boolean(appBootstrapped)
    && Boolean(moduleRuntime)
    && mesRenderDepth === 0;
  if (canRefreshVisibleWeeklyPage) {
    // Switch to the compatibility snapshot immediately; the server refresh is
    // background-only and must never hide a just-written local value.
    render({ skipRememberScroll: true });
    hydrateWeeklyPlanningPeriod();
  }
}

function getWeeklyPlanningLocalRows(bounds = {}) {
  const from = toDate(bounds.fromAt || bounds.from);
  const to = toDate(bounds.toAt || bounds.to);
  if (!Number.isFinite(from?.getTime?.()) || !Number.isFinite(to?.getTime?.()) || to <= from) return [];
  return getPlanningTableSlotRows().filter((row) => {
    const start = toDate(row?.plannedStart);
    const end = toDate(row?.plannedEnd);
    return Number.isFinite(start?.getTime?.())
      && Number.isFinite(end?.getTime?.())
      && start < to
      && end > from;
  });
}

function setPlanningStateAndInvalidate(nextState) {
  // The generic module facades publish their current state after every call,
  // including read-only helpers used during rendering. A matching root object
  // is not a planning change. Actual in-place writes are invalidated after a
  // successful persistState() below, while root replacements continue to
  // invalidate immediately.
  if (nextState === planningState) return;
  planningState = nextState;
  invalidateWeeklyPlanningPeriod();
}

function hydrateWeeklyPlanningPeriod() {
  const bounds = getWeeklyPlanningPeriodBounds();
  if (weeklyPlanningPeriodState.loading && weeklyPlanningPeriodState.key === bounds.key) return;
  // The read model owns TTL/ETag revalidation. Avoid a needless render cycle
  // while its cached answer is fresh, but revalidate an open Weekly screen
  // when the cache expires or when a planning write changes its projection.
  if (Array.isArray(weeklyPlanningPeriodState.rows)
    && weeklyPlanningPeriodState.key === bounds.key
    && !weeklyPlanningPeriodState.stale
    && (!planningPeriodReadModel || !planningPeriodReadModel.shouldRefresh(bounds))) {
    scheduleWeeklyPlanningPeriodRefresh(bounds);
    return;
  }
  const hadRows = Array.isArray(weeklyPlanningPeriodState.rows) && weeklyPlanningPeriodState.key === bounds.key;
  const previousError = String(weeklyPlanningPeriodState.error || "");
  const previousFallbackReason = String(weeklyPlanningPeriodState.fallbackReason || "");
  const requestEpoch = Number(weeklyPlanningPeriodState.epoch || 0);
  const force = weeklyPlanningPeriodState.stale;
  const preferLocalBeforeRefresh = Boolean(weeklyPlanningPeriodState.preferLocal);
  weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, key: bounds.key, loading: true, error: "" };
  void ensureWeeklyPlanningPeriodModule().then((ready) => ready
    ? planningPeriodReadModel.refresh({ ...bounds, force })
    : { ok: false, error: weeklyPlanningPeriodState.error || "Weekly planning period module is unavailable" },
  ).then((result) => {
    // Navigation can cross a week boundary while a request is in flight. Do
    // not replace the active week with a late response for the prior range.
    if (weeklyPlanningPeriodState.key !== bounds.key) return;
    if (Number(weeklyPlanningPeriodState.epoch || 0) !== requestEpoch) {
      weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, loading: false, stale: true };
      hydrateWeeklyPlanningPeriod();
      return;
    }
    const hasCompactRows = Array.isArray(result?.rows);
    if (!result?.ok
      || (!hasCompactRows && !result?.projection)
      || (hasCompactRows && typeof buildWeeklyPlanningPeriodRowsFromCompact !== "function")
      || (!hasCompactRows && typeof buildWeeklyPlanningPeriodRows !== "function")) {
      weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, loading: false, stale: true, error: result?.error || "Weekly planning period API is unavailable" };
      scheduleWeeklyPlanningPeriodRefresh(bounds);
      if (ui.activeModule === "weeklyProductionControl") render({ skipRememberScroll: true });
      return;
    }
    const lookups = getWeeklyPlanningPeriodLookups();
    const rows = hasCompactRows
      ? buildWeeklyPlanningPeriodRowsFromCompact(result.rows, {
        toDate,
        mapWorkCenterId: mapLegacyWorkCenterId,
        ...lookups,
        resolveSlotPresentation: resolveWeeklyCompactSlotPresentation,
      })
      : buildWeeklyPlanningPeriodRows(result.projection, {
        toDate,
        mapWorkCenterId: mapLegacyWorkCenterId,
        ...lookups,
      });
    // A 304 only means the server answer did not change; it does not prove
    // that an asynchronous snapshot sync already contains the local write.
    // Accept the compact response again only after its visible weekly rows
    // match the in-memory compatibility projection.
    const preferLocal = preferLocalBeforeRefresh
      && !(typeof weeklyPlanningRowsEquivalent === "function"
        && weeklyPlanningRowsEquivalent(rows, getWeeklyPlanningLocalRows(bounds), { toDate }));
    weeklyPlanningPeriodState = {
      key: bounds.key,
      rows,
      loading: false,
      stale: false,
      preferLocal,
      epoch: requestEpoch,
      error: "",
      fallbackReason: String(result.fallbackReason || ""),
    };
    scheduleWeeklyPlanningPeriodRefresh(bounds);
    if ((!hadRows
      || result.changed
      || preferLocalBeforeRefresh !== preferLocal
      || Boolean(previousError)
      || previousFallbackReason !== weeklyPlanningPeriodState.fallbackReason)
      && ui.activeModule === "weeklyProductionControl") render({ skipRememberScroll: true });
  }).catch(() => {
    if (weeklyPlanningPeriodState.key !== bounds.key) return;
    weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, loading: false, stale: true, error: "Weekly planning period API is unavailable" };
    scheduleWeeklyPlanningPeriodRefresh(bounds);
    if (ui.activeModule === "weeklyProductionControl") render({ skipRememberScroll: true });
  });
}

function getWeeklyProductionControlRuntimeInstance() {
  if (weeklyProductionControlRuntimeInstance) return weeklyProductionControlRuntimeInstance;
  if (!weeklyProductionControlRuntimeLoad) {
    weeklyProductionControlRuntimeLoad = import("./modules/weekly_production_control/render.js")
      .then(({ createWeeklyProductionControlModule }) => {
        weeklyProductionControlRuntimeInstance = createWeeklyProductionControlRuntimeInstance(createWeeklyProductionControlModule);
        hydrateWeeklyPlanningPeriod();
        if (ui.activeModule === "weeklyProductionControl") render();
        return weeklyProductionControlRuntimeInstance;
      })
      .catch((error) => {
        weeklyProductionControlRuntimeError = error;
        console.error("Не удалось загрузить модуль контроля недели", error);
        if (ui.activeModule === "weeklyProductionControl") render();
        return weeklyProductionControlLoadingInstance;
      });
  }
  return weeklyProductionControlLoadingInstance;
}

const PRODUCTION_STRUCTURE_REGISTRY_IDS = new Set(["employees", "positions", "orgUnits", "workCenters", "equipment", "responsibilityPolicies", "migrationDiagnostics"]);
const PRODUCTION_STRUCTURE_REGISTRY_QUERY_PARAM = "structureRegistry";

function getProductionStructureMatrixRegistryFromUrl() {
  if (typeof window === "undefined") return "";
  const raw = String(new URLSearchParams(window.location.search || "").get(PRODUCTION_STRUCTURE_REGISTRY_QUERY_PARAM) || "").trim();
  if (!raw) return "";
  return PRODUCTION_STRUCTURE_REGISTRY_IDS.has(raw) ? raw : "orgUnits";
}

function updateProductionStructureMatrixRegistryUrl(registryId = "orgUnits") {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const normalized = PRODUCTION_STRUCTURE_REGISTRY_IDS.has(String(registryId || "")) ? String(registryId) : "orgUnits";
  const url = new URL(window.location.href);
  const evaluationRouteActive = [...url.searchParams].some(([key, value]) => key.startsWith("react-structure-") && (key.endsWith("-evaluation") || key.endsWith("-write")) && value === "1");
  if (ui.activeModule === "productionStructureMatrix" && (normalized !== "orgUnits" || evaluationRouteActive)) url.searchParams.set(PRODUCTION_STRUCTURE_REGISTRY_QUERY_PARAM, normalized);
  else url.searchParams.delete(PRODUCTION_STRUCTURE_REGISTRY_QUERY_PARAM);
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, "", nextUrl);
}

let bindProductionStructureMatrixEvents = () => {};
let getProductionStructureMatrixActiveRegistry = () => getProductionStructureMatrixRegistryFromUrl() || "orgUnits";
let getProductionStructureMatrixRuntimeOverrides = () => normalizePlainRecord(ui?.productionStructureMatrixOverrides);
let setProductionStructureMatrixActiveRegistry = () => "orgUnits";
let renderProductionStructureMatrixPage = () => renderUiModulePage({
  ariaLabel: "Структура производства",
  className: "production-structure-matrix-page",
  content: renderUiEmptyState({ title: "Загружаем структуру производства", description: "Полная матрица открывается только по запросу." }),
});
let productionStructureMatrixModuleLoad = null;
let productionStructureMatrixModuleState = { status: "idle", error: "" };
let productionStructureMatrixData = { PRODUCTION_STRUCTURE_MATRIX_COLUMNS: [], PRODUCTION_STRUCTURE_MATRIX_ROWS: [] };
function initializeProductionStructureMatrixModule(factory, matrixData) {
  productionStructureMatrixData = matrixData;
  ({
    bindProductionStructureMatrixEvents,
    getProductionStructureMatrixActiveRegistry,
    getProductionStructureMatrixRuntimeOverrides,
    renderProductionStructureMatrixPage,
    setProductionStructureMatrixActiveRegistry,
  } = factory({
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS: matrixData.PRODUCTION_STRUCTURE_MATRIX_COLUMNS,
  PRODUCTION_STRUCTURE_MATRIX_FIELD_OPTIONS: matrixData.PRODUCTION_STRUCTURE_MATRIX_FIELD_OPTIONS,
  PRODUCTION_STRUCTURE_MATRIX_ROWS: matrixData.PRODUCTION_STRUCTURE_MATRIX_ROWS,
  SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES,
  archiveSystemDomainEntity,
  canEditSystemDomainRegistry,
  escapeAttribute,
  escapeHtml,
  getApp: () => app,
  getShiftMasterAssignableEmployees,
  getShiftMasterAssignmentConfig,
  getShiftMasterDefaultEmployeeScope,
  getShiftMasterEmployeeRows,
  getShiftMasterNormalizedWorkCenterId,
  getShiftMasterProfile,
  getShiftMasterProfiles,
  getShiftMasterWorkCenterCatalog,
  getSystemDomainsMigrationReport,
  getSystemDomainsState,
  getUi: () => ui,
  getWorkCenter,
  joinUiClasses,
  normalizePlainRecord,
  normalizeShiftMasterAssignmentScopeMode,
  notifySaveSuccess,
  onActiveRegistryChange: updateProductionStructureMatrixRegistryUrl,
  persistUiState,
  render,
  renderUiActionButton,
  renderUiEmptyState,
  renderUiFormField,
  renderUiFormGrid,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiModuleSidebar,
  renderUiPanel,
  renderUiPanelBody,
  renderUiSidebarItem,
  renderUiStatusToken,
  renderUiTableControlAttributes,
  renderUiTableWrap,
  resetShiftMasterAssignmentMatrixConfig,
  selected,
  setShiftMasterAssignmentMatrixConfig,
  setShiftMasterAssignmentMatrixEmployee,
  sortShiftMasterAssignableEmployees,
  syncProductionStructureMatrixToPlanningState,
  upsertSystemDomainEntity,
  }));
}

function ensureProductionStructureMatrixModule() {
  if (productionStructureMatrixModuleLoad) return;
  productionStructureMatrixModuleState = { status: "loading", error: "" };
  productionStructureMatrixModuleLoad = Promise.all([
    import("./modules/production_structure_matrix/render.js"),
    import("./production_structure_matrix_data.js"),
    ensureLegacyProductionStructure(),
  ]).then(([{ createProductionStructureMatrixModule }, matrixData]) => {
    initializeProductionStructureMatrixModule(createProductionStructureMatrixModule, matrixData);
    productionStructureMatrixModuleState = { status: "ready", error: "" };
    if (["productionStructureMatrix", "weeklyProductionControl", "timesheet"].includes(ui.activeModule)) render();
  }).catch((error) => {
    productionStructureMatrixModuleState = { status: "error", error: error?.message || "Production Structure Matrix module is unavailable" };
    console.error("Не удалось загрузить структуру производства", error);
    renderProductionStructureMatrixPage = () => renderUiModulePage({
      ariaLabel: "Структура производства",
      className: "production-structure-matrix-page",
      content: renderUiEmptyState({ title: "Модуль недоступен", description: "Обновите страницу и повторите попытку." }),
    });
    if (["productionStructureMatrix", "weeklyProductionControl", "timesheet"].includes(ui.activeModule)) render();
  });
}

let bindAccessRolesEvents = () => {};
let renderAccessRolesPage = () => renderUiModulePage({
  ariaLabel: "Роли и доступ",
  className: "access-roles-page",
  content: renderUiEmptyState({ title: "Загружаем модуль", description: "Экран ролей откроется автоматически." }),
});
let accessRolesModuleLoad = null;

function initializeAccessRolesModule(factory) {
  ({
    bindAccessRolesEvents,
    renderAccessRolesPage,
  } = factory({
  ACCESS_ROLE_ACTIONS,
  ACCESS_ROLE_SCOPES,
  escapeAttribute,
  escapeHtml,
  getAccessControlNow: () => new Date(),
  getAccessControlResourceContext,
  getAccessControlService,
  getAccessControlSubject,
  getAccessRoleForEmployee,
  getAccessRoleProfiles,
  getApp: () => app,
  getMesModuleFlowContract,
  getModuleAnnotation,
  getModuleDefinitions,
  getProductionStructureEmployees,
  getProductionStructureMatrixRuntimeOverrides,
  getUi: () => ui,
  normalizeAccessPermissionRecord,
  normalizeAccessRoleAssignments,
  normalizeInterfaceRoleId,
  notifyAccessControlFailure,
  notifySaveSuccess,
  persistUiState,
  render,
  renderMesModulePatternPage,
  renderUiActionButton,
  renderUiFormGrid,
  renderUiFormField,
  renderUiSidebarItem,
  renderUiPanel,
  renderUiPanelBody,
  renderUiStatusToken,
  renderUiTableControlAttributes,
  renderUiTableWrap,
  resetAccessControlConfiguration,
  resetAccessRoleConfiguration,
  setAccessGrant,
  setAccessRoleAssignment,
  setAccessRoleModulePermission,
  setAccessRoleProfileField,
  setResponsibilityScope,
  setSubjectRoleAssignment,
  updateAccessRole,
  }));
}

function ensureAccessRolesModule() {
  if (accessRolesModuleLoad) return;
  accessRolesModuleLoad = import("./modules/access_roles/render.js")
    .then(({ createAccessRolesModule }) => {
      initializeAccessRolesModule(createAccessRolesModule);
      if (ui.activeModule === "roles") render();
    })
    .catch((error) => {
      console.error("Не удалось загрузить модуль ролей", error);
      renderAccessRolesPage = () => renderUiModulePage({
        ariaLabel: "Роли и доступ",
        className: "access-roles-page",
        content: renderUiEmptyState({ title: "Модуль недоступен", description: "Обновите страницу и повторите попытку." }),
      });
      if (ui.activeModule === "roles") render();
    });
}

let bindContourAdminEvents = () => {};
let executeContourAdminAction = async () => ({ ok: false, error: "Contour Admin ещё не загружен." });
let getContourAdminModel = () => ({ contours: [], scenarios: [], speedRows: [], guardrails: [] });
let renderContourAdminPage = () => renderUiModulePage({
  ariaLabel: "Администрирование контура",
  className: "contour-admin-page",
  content: renderUiEmptyState({ title: "Загружаем модуль", description: "Экран администрирования откроется автоматически." }),
});
let contourAdminModuleLoad = null;
let contourAdminModuleReady = false;

function initializeContourAdminModule(factory) {
  ({
    bindContourAdminEvents,
    executeContourAdminAction,
    getContourAdminModel,
    renderContourAdminPage,
  } = factory({
  appendLocalDataSafetyAudit,
  escapeAttribute,
  escapeHtml,
  getApp: () => app,
  notifySaveSuccess,
  renderUiActionButton,
  renderUiInfoGrid,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiPanel,
  renderUiPanelBody,
  renderUiStatusToken,
  renderUiTableWrap,
  }));
}

function ensureContourAdminModule() {
  if (contourAdminModuleLoad) return;
  contourAdminModuleLoad = import("./modules/contour_admin/render.js")
    .then(({ createContourAdminModule }) => {
      initializeContourAdminModule(createContourAdminModule);
      contourAdminModuleReady = true;
      if (ui.activeModule === "contourAdmin") render();
    })
    .catch((error) => {
      console.error("Не удалось загрузить модуль администрирования", error);
      renderContourAdminPage = () => renderUiModulePage({
        ariaLabel: "Администрирование контура",
        className: "contour-admin-page",
        content: renderUiEmptyState({ title: "Модуль недоступен", description: "Обновите страницу и повторите попытку." }),
      });
      if (ui.activeModule === "contourAdmin") render();
    });
}

function measureBootStep(name, callback) {
  const stepStart = performance.now();
  try {
    return callback();
  } finally {
    const now = performance.now();
    bootPerformance.entries.push({
      step: name,
      ms: Number((now - stepStart).toFixed(2)),
      at: Number((now - bootPerformance.start).toFixed(2)),
    });
  }
}

function publishBootPerformance() {
  const now = performance.now();
  const totalMs = Number((now - bootPerformance.start).toFixed(2));
  const htmlStart = Number(window.__MES_BOOT_HTML_START__ || 0);
  const totalFromHtmlMs = htmlStart > 0 ? Number((now - htmlStart).toFixed(2)) : totalMs;
  const staticImportsMs = htmlStart > 0 ? Number((bootPerformance.start - htmlStart).toFixed(2)) : 0;
  const entries = [
    {
      step: "static imports before app timer",
      ms: staticImportsMs,
      at: staticImportsMs,
    },
    ...bootPerformance.entries,
    {
      step: "startup total after static imports",
      ms: totalMs,
      at: totalMs,
    },
    {
      step: "startup total from html",
      ms: totalFromHtmlMs,
      at: totalFromHtmlMs,
    },
  ];
  const report = {
    version: APP_VERSION,
    totalMs,
    totalFromHtmlMs,
    staticImportsMs,
    entries,
    note: "totalMs starts after static ES imports; totalFromHtmlMs starts before the app module request.",
  };
  window.__MES_BOOT_PERF__ = report;
  try {
    sessionStorage.setItem("mes-boot-performance-last", JSON.stringify(report));
  } catch {
    // Ignore storage restrictions; console output is still available.
  }
  console.groupCollapsed(`[MES boot] ${APP_VERSION}: ${totalMs} ms`);
  console.table(entries);
  console.log("[MES boot data]", report);
  console.log("[MES boot data json]", JSON.stringify(report));
  console.groupEnd();
}

const STARTUP_SLOT_COMPARE_FIELDS = [
  "routeWorkCenterId",
  "workCenterId",
  "routeStepId",
  "operationName",
  "operationId",
  "resourceId",
  "unitsPerHour",
  "calculationType",
  "secondsPerPanel",
  "setupMin",
  "quantity",
  "bomListId",
  "boardsPerPanel",
  "plannedStart",
  "plannedEnd",
];

function objectsHaveSameFields(left = {}, right = {}, fields = []) {
  return fields.every((field) => String(left?.[field] ?? "") === String(right?.[field] ?? ""));
}

function arraysHaveSameFields(left = [], right = [], fields = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => objectsHaveSameFields(item, right[index], fields));
}

function renderFatalStartupError(error) {
  if (!app) return;
  const message = error?.message || String(error || "Неизвестная ошибка");
  const stack = error?.stack || "";
  app.innerHTML = `
    <main class="startup-error-shell" aria-label="Ошибка запуска MES">
      <section class="startup-error-card">
        <header class="startup-error-head">
          <div class="startup-error-logo-row">
            <span class="startup-error-logo"><img src="./favicon.svg" alt="" aria-hidden="true" /></span>
            <div>
              <strong>MES</strong>
              <small>${escapeHtml(APP_VERSION)}</small>
            </div>
          </div>
          <span class="startup-error-status">Нужен перезапуск</span>
        </header>
        <div class="startup-error-body">
          <span class="startup-error-mark" aria-hidden="true">!</span>
          <div>
            <h1>Интерфейс не удалось запустить</h1>
            <p>MES остановил загрузку, чтобы не повредить рабочие данные. Перезапустите страницу — введённые и сохранённые данные останутся без изменений.</p>
            <strong class="startup-error-message">${escapeHtml(message)}</strong>
          </div>
        </div>
        <footer class="startup-error-actions">
          ${stack ? `<details class="startup-error-details"><summary>Технические детали</summary><pre>${escapeHtml(stack)}</pre></details>` : ""}
          <button type="button" class="startup-error-reload" data-startup-error-reload>Перезапустить интерфейс</button>
        </footer>
      </section>
    </main>
  `;
  app.querySelector("[data-startup-error-reload]")?.addEventListener("click", () => window.location.reload());
}

function handleGlobalRuntimeError(error) {
  if (!appBootstrapped) {
    renderFatalStartupError(error);
    return;
  }

  console.error("[MES] Runtime error after startup", error);
}

window.addEventListener("error", (event) => {
  handleGlobalRuntimeError(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  handleGlobalRuntimeError(event.reason || "Unhandled promise rejection");
});

var denseInlineViewportListenersBound = false;
var mobileModuleSwitcherBehaviorBound = false;
var employeeHierarchyConnectorFrame = 0;
var planningRouteStructureSidebarFrame = 0;
var ganttScrollRestoreInProgress = false;

const ROUTE_DOCUMENT_KIND_LABELS = {
  main: "Главная маршрутная карта",
  child: "Дочерняя маршрутная карта",
  shift: "Маршрутная карта смены",
};

const ROUTE_DOCUMENT_KIND_SHORT_LABELS = {
  main: "Главная карта",
  child: "Дочерняя карта",
  shift: "Карта смены",
};

const ROUTE_DOCUMENT_KIND_ORDER = {
  main: 0,
  child: 1,
  shift: 2,
};

const GANTT_SLOT_STATUS_OPTIONS = getMesStatusOptions("ganttSlot");
const GANTT_SLOT_STATUS_VALUES = GANTT_SLOT_STATUS_OPTIONS.length
  ? GANTT_SLOT_STATUS_OPTIONS.map((status) => status.value)
  : SLOT_STATUSES;
const GANTT_SLOT_STATUS_LABELS = {
  ...STATUS_LABELS,
  ...Object.fromEntries(GANTT_SLOT_STATUS_OPTIONS.map((status) => [status.value, status.label])),
};
const MES_STATUS_CONTRACT_KEYS = new Set(MES_STATUS_CONTRACTS.map((status) => `${status.scope}:${status.value}`));
const WORK_ORDER_PLANNING_STATUS_VALUES = new Set(getMesStatusOptions("workOrderPlanning").map((status) => status.value));
const DISPATCH_FACT_CONTRACT_OPTIONS = getMesStatusOptions("dispatchFact");
const DISPATCH_FACT_STATUS_OPTIONS = (DISPATCH_FACT_CONTRACT_OPTIONS.length ? DISPATCH_FACT_CONTRACT_OPTIONS : [
  { value: "not_reported", label: "Факт не внесен", tone: "neutral" },
  { value: "accepted", label: "Принято", tone: "ok" },
  { value: "partial", label: "Частично", tone: "warning" },
  { value: "problem", label: "Проблема", tone: "critical" },
]).map((status) => ({
  value: status.value,
  label: status.label,
  tone: status.tone,
}));

const SHIFT_WORKBENCH_WINDOW_DAYS = 1;
const GANTT_DEPENDENCY_ROUTE_VERSION = 2;
const SHIFT_MASTER_BOARD_LANES = [
  { id: "intake", label: "План", caption: "ожидает распределения мастером", tone: "neutral" },
  { id: "assigned", label: "В работе", caption: "есть ресурс, исполнители или лист", tone: "primary" },
  { id: "fact", label: "Закрытие смены", caption: "смена вернула результат", tone: "ok" },
];
const SHIFT_MASTER_BOARD_SWIMLANES = [
  { id: "order", label: "По заказ-нарядам" },
  { id: "workCenter", label: "По участкам" },
  { id: "master", label: "По мастерам" },
];
const SHIFT_MASTER_BOARD_FOCUS_MODES = [
  { id: "all", label: "Все" },
  { id: "mine", label: "Мои" },
  { id: "open", label: "Незакрытые" },
  { id: "attention", label: "Требуют внимания" },
];
const SHIFT_MASTER_BOARD_RISK_REASONS = [
  { id: "", label: "Нет риска" },
  { id: "material", label: "Материал" },
  { id: "resource", label: "Ресурс" },
  { id: "quality", label: "Качество" },
  { id: "tech", label: "Технология" },
  { id: "document", label: "Документ" },
];
const TIMESHEET_DAY_OPTIONS = [
  { value: "work", code: "work", label: "8:00-17:00", display: ["8:00", "17:00"], title: "Рабочая смена 8:00-17:00", hours: 8, overtime: 0 },
  { value: "overtime", code: "work-overtime", label: "8:00-17:00 +2", display: ["8:00", "17:00"], title: "Рабочая смена 8:00-17:00; сверхурочно +2 ч", hours: 10, overtime: 2 },
  { value: "vacation", code: "vacation", label: "Отп.", display: ["Отп."], title: "Плановый отпуск", hours: 0, overtime: 0 },
  { value: "sick", code: "sick", label: "Б/л", display: ["Б/л"], title: "Больничный", hours: 0, overtime: 0 },
  { value: "leave", code: "leave", label: "Отг.", display: ["Отг."], title: "Отгул", hours: 0, overtime: 0 },
  { value: "off", code: "off", label: "Вых", display: ["Вых"], title: "Выходной", hours: 0, overtime: 0 },
];
const TIMESHEET_VIEW_OPTIONS = [
  { id: "month", label: "Месяц" },
  { id: "week", label: "Неделя" },
];
const TIMESHEET_SCHEDULE_OPTIONS = [
  { code: "5/2", label: "5/2", caption: "пятидневка", start: "08:00", end: "17:00", patternOffset: 0 },
  { code: "2/2", label: "2/2", caption: "сменный график", start: "08:00", end: "20:00", patternOffset: 0 },
];

const defaultUiState = {
  activeRole: DEFAULT_INTERFACE_ROLE_ID,
  activeModule: "gantt",
  activeDirectory: "operations",
  activeProjectId: "",
  activeSpecificationId: "",
  spekiEditingId: "",
  spekiCheckedSpecificationId: "",
  spekiStaleItemIds: [],
  spekiCollapsedBomIds: [],
  activeBomId: "",
  activeNomenclatureId: "",
  activeNomenclaturePane: "items",
  activeOperationId: "",
  nomenclatureTypeFilter: "all",
  activeRouteId: "",
  routePrintPreviewId: "",
  workOrderPrintPreviewId: "",
  routeFlowStepId: "",
  routeLaborStepId: "",
  activeShiftMasterId: "master-smt",
  shiftMasterScope: "all",
  shiftMasterBoardSelectedSlotId: "",
  shiftMasterBoardSwimlane: "order",
  shiftMasterBoardFocus: "all",
  shiftMasterBoardLaneBySlot: {},
  shiftMasterBoardAssignments: {},
  shiftMasterBoardFacts: {},
  shiftMasterBoardCarryovers: {},
  shiftMasterBoardPrintPreviewId: "",
  shiftWorkOrderJournalSelectedId: "",
  shiftWorkOrderPrintPreviewId: "",
  shiftWorkOrderIssuePhotoViewer: null,
  shiftWorkOrderIssueReports: {},
  shiftWorkOrderCollapsedTreeIds: [],
  shiftMasterAssignmentMatrix: {},
  activeDispatchSlotId: "",
  timesheetView: "month",
  timesheetPeriodAnchor: "2026-06-01",
  timesheetCellOverrides: {},
  timesheetScheduleOverrides: {},
  timesheetEditor: null,
  productionStructureMatrixOverrides: {},
  routeDraftBindingId: "",
  routeBindingMode: "product",
  planningWorkItem: "",
  weeklyProductionControlWeekAnchor: "2026-06-01",
  planningLaborNoteByRow: {},
  planningLegacyManualLaborByStep: {},
  authPrototypeDepartment: "",
  authPrototypeUnit: "",
  authPrototypeSearch: "",
  authPrototypePersonId: "",
  authPrototypeResult: "",
  authGateUnlocked: false,
  authCurrentUserId: "",
  accessRoleProfiles: [],
  accessRoleAssignments: {},
  accessRolesSelectedRoleId: DEFAULT_INTERFACE_ROLE_ID,
  accessRolesSelectedEmployeeId: "",
  authPrototypeAttemptsLeft: AUTH_GATE_MAX_ATTEMPTS,
  authSessionViewedPersonId: "",
  authSessionSelectedTaskId: "",
  authSessionFactDrafts: {},
  authSessionReportDrafts: {},
  authSessionActiveFactField: "actual",
  authSessionModal: null,
  confirmDialog: null,
  ganttOptimizationDialog: null,
  directoryEditor: null,
  directoryReader: null,
  selectedDirectoryRows: {},
  directoryColumnFilters: {},
  scale: "days",
  windowStart: "2026-06-01",
  workCenterFilter: "all",
  rowMode: "route",
  autoCascade: true,
  hideSharedNonWorkingZones: false,
  focusMode: false,
  ganttZoom: 1,
  ganttSlotContent: "operationQuantity",
  ganttShowQuantity: true,
  ganttDependencyEditMode: false,
  ganttDependencyRoutes: {},
  ganttDependencyRouteDrafts: null,
  ganttDependencyDrag: null,
  timelineCounts: { hours: scaleConfig.hours.count, days: scaleConfig.days.count, weeks: scaleConfig.weeks.count },
  expandedProjects: new Set(["p-x100", "p-v2", "p-mes"]),
  selectedSlotId: null,
  editor: null,
  splitSlotId: null,
  drag: null,
  scrollLeft: 0,
  scrollTop: 0,
  now: new Date(),
};


let addNomenclatureToBom, applyGanttRowToSlot, cancelAuthPrototypePinFeedback, completeAuthPrototypeLogin, createSpekiSpecification, deleteBomImportRow, ensureNomenclatureTypeExists, ensureRouteModuleProjectForSpecification, findSmtLineByNumber, getActiveSpecificationForModule, getAuthPrototypeAttemptsLeft, getAuthPrototypeDepartmentRows, getAuthPrototypeDirectDepartmentPeople, getAuthPrototypePeople, getAuthPrototypePeopleByUnit, getAuthPrototypePinFeedbackTone, getAuthPrototypePinPerson, getAuthPrototypeSelectedDepartment, getAuthPrototypeSelectedPerson, getAuthPrototypeSelectedUnit, getAuthPrototypeUnitRows, getBomImportRowNomenclatureItem, getBomImportRows, getBomLinkedSpecifications, getBomList, getBomResultNomenclatureItem, getDefaultSmtLineConfigurations, getDirectoryRows, getFallbackNomenclatureType, getGanttResourceForSlot, getNomenclatureDeleteUsage, getNomenclatureItem, getResourceBaseCph, getResourceRowId, getResourcesForWorkCenter, getRouteBindingContext, getRouteBindingModeForSelection, getRouteBindingOptions, getRouteBomList, getRouteDocumentKind, getRouteDocumentKindLabel, getRouteDocumentKindShortLabel, getRouteLineageSubjectName, getRouteModuleSelectionName, getRouteModuleSelectionValue, getRouteParentRoute, getRouteRootRoute, getRouteScopeRootTask, getRouteSpecification, getRoutesForModule, getSlotGanttResourceId, getSlotGanttWorkCenterId, getSmtLineConfigurations, getSmtLineIdFromWorkCenterId, getSmtLineNumberFromText, getSpecificationBomEntries, getSpecificationById, getSpecificationDeleteUsage, getSpecificationItemBomId, getSpecificationProductionOrder, getSpekiStructureItemDisplayName, getSpekiStructureItemLabel, getSpekiStructureSectionOptions, getSpekiStructureTableRows, importBomFromXlsxFile, inferAccessRoleIdForPerson, isAuthPrototypePinFeedbackLocked, isSmtLineWorkCenterId, migrateSpecificationBomRowsToNomenclature, normalizeBomImportRow, normalizeLookupText, normalizeNomenclatureType, normalizeRouteBindingValue, normalizeSmtComponentKeyPart, renderModulePreviewEmpty, renderNomenclaturePage, resetAuthPrototypeAttempts, resolveRouteModuleProjectId, scheduleAuthPrototypePinValidation, scopeRouteTasks, summarizeBomComponentFields, syncNomenclatureTypeRename, syncNomenclatureTypesFromItems, syncSpecificationDerivedFields, updateBomImportCell, upsertBomResultToNomenclature;
let bindSpecifications2Events = () => {};
let renderSpecifications2Page = () => renderUiModulePage({
  ariaLabel: "Спецификации 2.0",
  className: "specifications2-page",
  content: renderUiEmptyState({ title: "Загружаем модуль", description: "Спецификация откроется автоматически." }),
});
let getSpecifications2ReactModel = () => ({ registry: [], selectedEntry: null, serverStatus: "empty", serverError: "" });
let updateSpecifications2DraftRow = () => ({ ok: false, message: "Модуль Specifications 2.0 ещё не загружен." });
let publishSpecifications2EntryById = () => Promise.resolve({ ok: false, error: "Модуль Specifications 2.0 ещё не загружен." });
let createSpecifications2WorkOrder = () => Promise.resolve({ ok: false, error: "Модуль Specifications 2.0 ещё не загружен." });
let specifications2ModuleLoad = null;
let specifications2ModuleReady = false;
let specifications2RevisionsReadModel = null;
let specifications2PublishCommands = null;
let specifications2AttachmentCommands = null;
function getSpecifications2PublishedRevision(sourceEntryId) {
  return specifications2RevisionsReadModel?.getBySource?.(sourceEntryId) || null;
}
async function refreshSpecifications2PublishedRevision(sourceEntryId, { force = false } = {}) {
  const normalizedSourceEntryId = String(sourceEntryId || "").trim();
  if (!normalizedSourceEntryId) return { ok: false, changed: false };
  await ensureSpecifications2Module();
  const beforeRefresh = getSpecifications2PublishedRevision(normalizedSourceEntryId);
    const completionChangesEligibility = Boolean(beforeRefresh?.loading)
      || (!beforeRefresh?.fetchedAt && !beforeRefresh?.item && !beforeRefresh?.error);
  const result = await Promise.resolve(specifications2RevisionsReadModel?.refreshBySource?.(normalizedSourceEntryId, { force }) || { ok: false });
  // An expired cache may already contain the exact immutable revision while
  // its revalidation is in flight. React intentionally waits for that
  // request, so completion must repaint even when the server returns the
  // same payload (`changed: false`) or an error that legacy must expose.
  if ((result.changed || completionChangesEligibility) && ui.activeModule === "specifications2") render();
  return result;
}
function hydrateSpecifications2PublishedRevision(entry) {
  if (!entry?.publication?.revision || !entry?.id) return;
  void refreshSpecifications2PublishedRevision(entry.id);
}
normalizeLookupText = (value) => String(value || "").trim().toLowerCase();
function bindSpekiEvents(...args) { return appEventsService.bindSpekiEvents(...args); }
function initializeSpecifications2Module(factory, buildSpecifications2Publication) {
  const prepareSpecifications2Publication = (entry) => {
    const result = buildSpecifications2Publication(entry, { directoryState, planningState });
    const publication = result.publication;
    return {
      publication,
      // The server export derives its immutable source timestamp from the
      // editor entry.  Keep it aligned with the prepared publication without
      // committing any compatibility state before the server acknowledges it.
      entry: { ...entry, publication, updatedAt: publication.releasedAt || new Date().toISOString() },
    };
  };
  const commitSpecifications2Publication = (entry, acknowledgedPublication = null) => {
    if (isLegacyDirectoryWriteBlocked()) {
      throw new Error("Публикация недоступна: серверная команда совместимого состава изделия ещё не подключена.");
    }
    const result = buildSpecifications2Publication(entry, {
      directoryState,
      planningState,
      acknowledgedPublication,
    });
    directoryState = normalizeDirectoryState(result.directoryState);
    planningState = normalizePlanningState(result.planningState);
    invalidateWeeklyPlanningPeriod();
    if (persistDirectoryState() === false) {
      throw new Error("Публикация не сохранена: серверная команда совместимого состава изделия ещё не подключена.");
    }
    persistState();
    return result.publication;
  };
  ({
    bindSpecifications2Events,
    createSpecifications2WorkOrder,
    getSpecifications2ReactModel,
    publishSpecifications2EntryById,
    renderSpecifications2Page,
    updateSpecifications2DraftRow,
  } = factory({
    escapeAttribute,
    escapeHtml,
    getRouteOperationPresets: () => ({
      departments: getRouteInstructionWorkCenters().map((center) => ({
        id: center.id,
        name: center.name,
        parentWorkCenterId: center.parentWorkCenterId || "",
      })),
      operations: getOperationMapRows({ includeInactive: false })
        .filter((operation) => !operation.legacyAliasOf && operation.coverage !== "blocked")
        .map((operation) => ({
          id: operation.id,
          name: operation.name,
          workCenterId: getOperationRouteWorkCenterId(operation),
        })),
    }),
    prepareSpecifications2Publication,
    commitSpecifications2Publication,
    publishSpecifications2Entry: (entry) => commitSpecifications2Publication(entry),
    publishServerRevision: (entry, { expectedPreviousRevision } = {}) => isLegacyDirectoryWriteBlocked()
      ? Promise.resolve({ ok: false, disabled: true, error: "Публикация доступна только для чтения: серверная команда совместимого состава изделия ещё не подключена." })
      : specifications2PublishCommands?.publishRevision?.({ entry, expectedPreviousRevision }) || Promise.resolve({ ok: false, error: "Specifications 2.0 server client is unavailable" }),
    getServerPublicationCapability: (options) => specifications2PublishCommands?.refreshCapability?.(options) || Promise.resolve({
      ok: false,
      enabled: false,
      serverPrimary: MES_RUNTIME_CONFIG.MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY === true,
      policyPrimary: MES_RUNTIME_CONFIG.MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY === true,
      error: "Specifications 2.0 server client is unavailable",
    }),
    serverPublicationPrimaryPolicy: MES_RUNTIME_CONFIG.MES_SPECIFICATIONS2_SERVER_PUBLICATION_PRIMARY === true,
    uploadServerAttachment: (input) => specifications2AttachmentCommands?.upload?.(input) || Promise.resolve({ ok: false, error: "Specifications 2.0 server client is unavailable" }),
    downloadServerAttachment: (input) => specifications2AttachmentCommands?.download?.(input) || Promise.resolve({ ok: false, error: "Specifications 2.0 server client is unavailable" }),
    getPublishedRevision: getSpecifications2PublishedRevision,
    hydratePublishedRevision: hydrateSpecifications2PublishedRevision,
    icon,
    notifySaveSuccess,
    runLongTask,
    render,
    renderUiActionButton,
    renderUiEmptyState,
    renderUiInfoGrid,
    renderUiModuleHeader,
    renderUiModulePage,
    renderUiModuleSidebar,
    renderUiPanel,
    renderUiPanelBody,
    renderUiSidebarItem,
    renderUiStatusToken,
    renderUiTableWrap,
  }));
  specifications2ModuleReady = true;
}

function ensureSpecifications2Module() {
  if (specifications2ModuleLoad) return specifications2ModuleLoad;
  hydrateSharedStateForModule("specifications2", [DIRECTORY_STORAGE_KEY]);
  void runtimeStateService?.hydrateSharedStateValues?.([SPECIFICATIONS2_STORAGE_KEY]).then((hydrated) => {
    if (hydrated && ui.activeModule === "specifications2") render();
  });
  specifications2ModuleLoad = Promise.all([
    import("./modules/specifications2/render.js"),
    import("./modules/specifications2/publication.js"),
    import("./modules/domain_api/specifications2_revisions_read_model.js"),
    import("./modules/domain_api/specifications2_publish_commands.js"),
    import("./modules/domain_api/specifications2_attachment_commands.js"),
  ])
    .then(([
      { createSpecifications2Module },
      { publishSpecifications2Entry },
      { createSpecifications2RevisionsReadModel },
      { createSpecifications2PublishCommands },
      { createSpecifications2AttachmentCommands },
    ]) => {
      specifications2RevisionsReadModel = createSpecifications2RevisionsReadModel();
      specifications2PublishCommands = createSpecifications2PublishCommands();
      specifications2AttachmentCommands = createSpecifications2AttachmentCommands();
      initializeSpecifications2Module(createSpecifications2Module, publishSpecifications2Entry);
      if (ui.activeModule === "specifications2") render();
    })
    .catch((error) => {
      specifications2ModuleReady = false;
      console.error("Не удалось загрузить модуль Спецификации 2.0", error);
      renderSpecifications2Page = () => renderUiModulePage({
        ariaLabel: "Спецификации 2.0",
        className: "specifications2-page",
        content: renderUiEmptyState({ title: "Модуль недоступен", description: "Обновите страницу и повторите попытку." }),
      });
      if (ui.activeModule === "specifications2") render();
    });
  return specifications2ModuleLoad;
}
let renderNomenclatureModulePage = null;
let nomenclatureRenderModuleLoad = null;
function getNomenclatureReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-nomenclature") === "1",
    readOnlyEvaluation: params.get("react-nomenclature-readonly") === "1",
    writeEvaluation: params.get("react-nomenclature-write") === "1",
  };
}
function isNomenclatureReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-nomenclature-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
function isNomenclatureReactWriteEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  return params.get("react-nomenclature-write-evaluation") === "1" && Boolean(getAuthenticatedAccessPerson());
}
function getNomenclatureReactReadState() {
  const hydrationState = getSharedStateModuleHydrationState("nomenclature", [DIRECTORY_STORAGE_KEY]);
  const ownerReady = hydrationState.status === "ready"
    && sharedStateStatus.configured === true
    && sharedStateStatus.enabled === true;
  return {
    ownerReady,
    serverReadReady: ownerReady,
    serverReadFailure: hydrationState.status === "error"
      ? String(hydrationState.reason || "read-unavailable")
      : "",
  };
}
function getNomenclatureReactActivation() {
  const localQa = getNomenclatureReactLocalQaOverrides();
  const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_NOMENCLATURE_READ_ONLY_EVALUATION === true;
  const serverWriteEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_NOMENCLATURE_WRITE_EVALUATION === true;
  const readEvaluationRequested = serverEvaluationAllowed && isNomenclatureReactEvaluationRequested();
  const writeEvaluationRequested = serverWriteEvaluationAllowed && isNomenclatureReactWriteEvaluationRequested();
  const localEvaluationEnabled = localQa.featureFlagEnabled && (localQa.readOnlyEvaluation || localQa.writeEvaluation);
  const runtimeActivation = resolveReactRuntimeActivation({
    surfaceId: "nomenclature",
    evaluationFeatureEnabled: MES_RUNTIME_CONFIG.MES_REACT_NOMENCLATURE === true,
    evaluationRequested: readEvaluationRequested || writeEvaluationRequested,
    localQaEnabled: localEvaluationEnabled,
  });
  const activation = {
    ...runtimeActivation,
    ...getNomenclatureReactReadState(),
    activePane: ui.activeNomenclaturePane === "boards" ? "boards" : "items",
    accessMode: runtimeActivation.runtimeMode === "react"
      ? "react"
      : runtimeActivation.featureFlagEnabled && (localQa.writeEvaluation || writeEvaluationRequested)
        ? "write-evaluation"
        : runtimeActivation.accessMode,
    policyId: String(MES_RUNTIME_CONFIG.MES_REACT_RUNTIME_POLICY?.policyId || ""),
  };
  if (activation.accessMode === "react" || isNomenclatureServerCommandsPrimary()) {
    void ensureNomenclatureServerCapabilities();
  }
  return activation;
}
function getNomenclatureReactWriteDecision(action = "edit", activation = getNomenclatureReactActivation()) {
  const normalizedAction = ["create", "delete"].includes(action) ? action : "edit";
  const serverAuthorityRequired = activation.accessMode === "react" || isNomenclatureServerCommandsPrimary();
  // Permanent ownership may never inherit the loopback QA bypass. The
  // temporary local write-evaluation contour keeps that bypass so its
  // isolated browser contract can still be exercised without weakening the
  // signed permanent policy (server evaluation already requires real auth).
  if (serverAuthorityRequired) {
    if (activation.ownerReady !== true) return { allowed: false, reason: "Актуальная серверная проекция Номенклатуры ещё не загружена." };
    if (nomenclatureServerCapabilitiesState.status !== "ready") {
      return { allowed: false, reason: "Проверяем серверную сессию и права сотрудника…" };
    }
    const result = nomenclatureServerCapabilitiesState.result;
    if (!result?.authenticated || !result.actor?.employeeId) {
      return { allowed: false, reason: nomenclatureServerCapabilitiesState.error || "Выполните вход под сотрудником, чтобы редактировать Номенклатуру." };
    }
    const localPerson = getAuthenticatedAccessPerson();
    if (!localPerson?.id || String(result.actor.employeeId) !== String(localPerson.id)) {
      return { allowed: false, reason: "Серверная сессия не совпадает с выбранным сотрудником. Выполните вход повторно." };
    }
    const sessionActor = getEmployeeServerActor();
    if (!sessionActor?.employeeId || String(sessionActor.employeeId) !== String(localPerson.id)) {
      return { allowed: false, reason: employeeServerSessionState.error || "Подписанная серверная сессия сотрудника не подтверждена." };
    }
    const capabilities = result.capabilities || {};
    if (capabilities.serverCommandsConfigured !== true || capabilities.serverCommandsEnabled !== true) {
      return { allowed: false, reason: "Серверные команды Номенклатуры сейчас отключены оператором." };
    }
    if (capabilities.canEditNomenclature !== true) {
      return { allowed: false, reason: "У сотрудника нет права редактировать Номенклатуру." };
    }
    if (normalizedAction === "create" && capabilities.canCreateNomenclature !== true) {
      return { allowed: false, reason: "У сотрудника нет права создавать позиции Номенклатуры." };
    }
    if (normalizedAction === "delete" && capabilities.canDeleteNomenclature !== true) {
      return { allowed: false, reason: "У сотрудника нет права удалять позиции Номенклатуры." };
    }
    return { allowed: true, reason: "" };
  }
  if (!canEditDirectorySection("nomenclature")) return { allowed: false, reason: "У текущей локальной роли нет права редактирования." };
  if (activation.accessMode !== "write-evaluation") return { allowed: false, reason: "Редактирование доступно только в разрешённом evaluation-контуре." };
  return { allowed: true, reason: "" };
}
function canRequestNomenclatureEmployeeElevation(activation = getNomenclatureReactActivation()) {
  if (!(activation.accessMode === "react" || isNomenclatureServerCommandsPrimary())) return false;
  if (!isEmployeeServerAuthAvailable() || activation.ownerReady !== true) return false;
  if (!getAuthenticatedAccessPerson()?.id) return false;
  const result = nomenclatureServerCapabilitiesState.status === "ready"
    ? nomenclatureServerCapabilitiesState.result
    : null;
  // Elevation solves only a missing employee session. It must not disguise an
  // authenticated RBAC denial, a disabled command owner or infrastructure
  // failure as a PIN problem.
  return Boolean(
    result
    && result.authenticated === false
    && !result.actor
    && result.capabilities?.serverCommandsConfigured === true
    && employeeServerSessionState.authenticated !== true
  );
}
function canNomenclatureReactWrite(activation = getNomenclatureReactActivation(), action = "edit") {
  return getNomenclatureReactWriteDecision(action, activation).allowed === true;
}
const nomenclatureReactIslandHost = createNomenclatureReactIslandHost({
  getActivation: getNomenclatureReactActivation,
  getPayload: () => {
    const activation = getNomenclatureReactActivation();
    const createDecision = getNomenclatureReactWriteDecision("create", activation);
    const editDecision = getNomenclatureReactWriteDecision("edit", activation);
    const deleteDecision = getNomenclatureReactWriteDecision("delete", activation);
    const deleteUsageById = Object.fromEntries((directoryState.nomenclature || []).map((item) => [
      String(item.id || ""),
      getNomenclatureDeleteUsage(item.id),
    ]));
    return {
      ...directoryState,
      capabilities: {
        create: createDecision.allowed,
        edit: editDecision.allowed,
        createEdit: createDecision.allowed && editDecision.allowed,
        delete: deleteDecision.allowed,
        employeeElevation: !editDecision.allowed && canRequestNomenclatureEmployeeElevation(activation),
        writeUnavailableReason: editDecision.reason || createDecision.reason || deleteDecision.reason,
        createUnavailableReason: createDecision.reason,
        editUnavailableReason: editDecision.reason,
        deleteUnavailableReason: deleteDecision.reason,
        deleteUsageById,
      },
    };
  },
  getTargetRoot: () => app,
  requestLegacyRender: () => {
    if (ui.activeModule === "nomenclature") render({ skipRememberScroll: true });
  },
  navigateBoards: () => {
    ui.activeNomenclaturePane = "boards";
    updateModuleUrlParam("bomLists");
    persistUiState();
    if (ui.activeModule === "nomenclature") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    if (command.type === "request-elevation") return beginNomenclatureEmployeeElevation();
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "delete") {
      const decision = await getNomenclatureReactWriteDecisionForCommand("delete");
      if (!decision.allowed) return { ok: false, code: "write-unavailable", message: decision.reason };
      const result = await deleteNomenclatureCommand({
        requireDurable: true,
        itemId: String(input.itemId || ""),
        idempotencyKey: String(input.idempotencyKey || ""),
        expectedRow: input.expectedRow && typeof input.expectedRow === "object" && !Array.isArray(input.expectedRow)
          ? input.expectedRow
          : null,
      });
      return {
        ok: result?.ok === true,
        id: String(result?.id || ""),
        code: String(result?.code || ""),
        message: String(result?.message || ""),
      };
    }
    if (command.type !== "save") throw new Error("Unsupported Nomenclature React command");
    const decision = await getNomenclatureReactWriteDecisionForCommand(input.isNew === true ? "create" : "edit");
    if (!decision.allowed) return { ok: false, code: "write-unavailable", message: decision.reason };
    const result = await saveNomenclatureCommand({
      requireDurable: true,
      isNew: input.isNew === true,
      itemId: String(input.itemId || ""),
      name: String(input.name || ""),
      article: String(input.article || ""),
      type: String(input.type || ""),
      package: String(input.package || ""),
      unit: String(input.unit || ""),
      manufacturer: String(input.manufacturer || ""),
      description: String(input.description || ""),
      status: String(input.status || ""),
      updatedAt: String(input.updatedAt || ""),
      idempotencyKey: String(input.idempotencyKey || input.saveIdempotencyKey || ""),
      expectedRow: input.expectedRow && typeof input.expectedRow === "object" && !Array.isArray(input.expectedRow)
        ? input.expectedRow
        : null,
    });
    return {
      ok: result?.ok === true,
      id: String(result?.id || ""),
      isNew: result?.isNew === true,
      code: String(result?.code || ""),
      message: String(result?.message || ""),
    };
  },
});
function refreshMountedNomenclatureReactProjection() {
  if (ui?.activeModule !== "nomenclature" || ui?.activeNomenclaturePane === "boards") return false;
  const activation = getNomenclatureReactActivation();
  if (activation.runtimeMode !== "react") return false;
  // Capture whether the current island can be refreshed before the exact GET
  // transitions its hydration state to loading. A mounted permanent editor
  // must stay alive while the newer projection is fetched so its opening
  // baseline can still reject a concurrent same-row update.
  const updatedMountedIsland = nomenclatureReactIslandHost.update();
  hydrateSharedStateForModule("nomenclature", [DIRECTORY_STORAGE_KEY], {
    allowBeforeInitialSync: true,
    failClosed: true,
  });
  return updatedMountedIsland;
}
function getBoardsReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-boards") === "1",
    readOnlyEvaluation: params.get("react-boards-readonly") === "1",
    writeEvaluation: params.get("react-boards-write") === "1",
  };
}
function isBoardsReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-boards-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const boardsReactIslandHost = createBoardsReactIslandHost({
  getActivation: () => {
    const localQa = getBoardsReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_BOARDS_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_BOARDS === true || localQa.featureFlagEnabled,
      activePane: ui.activeNomenclaturePane === "boards" ? "boards" : "items",
      accessMode: localQa.writeEvaluation
        ? "write-evaluation"
        : (serverEvaluationAllowed && isBoardsReactEvaluationRequested()) || localQa.readOnlyEvaluation
        ? "read-only-evaluation"
        : "editor",
    };
  },
  getPayload: () => {
    const localQa = getBoardsReactLocalQaOverrides();
    const deleteUsageById = Object.fromEntries((directoryState.bomLists || []).flatMap((bom) => {
      const boardId = String(bom?.id || "").trim();
      return boardId ? [[boardId, {
        specificationsCount: getBomLinkedSpecifications(boardId).length,
        bomRowsCount: getBomImportRows(bom).length,
      }]] : [];
    }));
    return {
      ...directoryState,
      selectedBoardId: String(ui.activeBomId || "").trim(),
      bomNomenclatureOptions: (directoryState.nomenclature || [])
        .filter((item) => normalizeLookupText(item?.type) === normalizeLookupText("РЭА компоненты"))
        .sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), "ru"))
        .map((item) => ({
          id: String(item?.id || "").trim(),
          label: String(item?.name || "Компонент без названия").trim(),
          meta: [item?.article, item?.package].map((value) => String(value || "").trim()).filter(Boolean).join(" · "),
        }))
        .filter((item) => item.id),
      deleteUsageById,
      capabilities: {
        createEdit: localQa.writeEvaluation && !isLegacyDirectoryWriteBlocked() && authorizeSystemDomainAction("nomenclature", "edit", { resourceId: "boards" }),
        delete: localQa.writeEvaluation && !isLegacyDirectoryWriteBlocked() && authorizeSystemDomainAction("nomenclature", "edit", { resourceId: "boards" }),
        bomImport: localQa.writeEvaluation && !isLegacyDirectoryWriteBlocked() && authorizeSystemDomainAction("nomenclature", "edit", { resourceId: "boards" }),
        bomRowAdd: localQa.writeEvaluation && !isLegacyDirectoryWriteBlocked() && authorizeSystemDomainAction("nomenclature", "edit", { resourceId: "boards" }),
        bomRowEdit: localQa.writeEvaluation && !isLegacyDirectoryWriteBlocked() && authorizeSystemDomainAction("nomenclature", "edit", { resourceId: "boards" }),
        bomRowDelete: localQa.writeEvaluation && !isLegacyDirectoryWriteBlocked() && authorizeSystemDomainAction("nomenclature", "edit", { resourceId: "boards" }),
      },
    };
  },
  getTargetRoot: () => app,
  requestItemsRender: () => {
    ui.activeNomenclaturePane = "items";
    updateModuleUrlParam("nomenclature");
    persistUiState();
    if (ui.activeModule === "nomenclature") render({ skipRememberScroll: true });
  },
  requestLegacyRender: () => {
    ui.activeNomenclaturePane = "boards";
    if (ui.activeModule === "nomenclature") render({ skipRememberScroll: true });
  },
  onSelectionChange: (boardId) => { ui.activeBomId = String(boardId || ""); },
  executeCommand: async (command = {}) => {
    const localQa = getBoardsReactLocalQaOverrides();
    if (isLegacyDirectoryWriteBlocked()) {
      return { ok: false, message: "Платы доступны только для чтения: серверная команда этого раздела ещё не подключена." };
    }
    if (!localQa.writeEvaluation || !authorizeSystemDomainAction("nomenclature", "edit", { resourceId: "boards" })) {
      return { ok: false, message: "Редактирование плат недоступно для текущей роли." };
    }
    if (!["save", "delete", "import-bom-xlsx", "add-bom-nomenclature-row", "update-bom-quantity", "update-bom-cell", "delete-bom-row"].includes(command.type)) return { ok: false, message: "Команда Boards не поддерживается." };
    if (!await ensureNomenclatureRenderModule()) return { ok: false, message: "Владелец платы ещё не загрузился." };
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    const rowSignature = (values = []) => values.map((value, index) => index === 6 ? Number(value || 0) : String(value ?? "").trim());
    if (command.type === "import-bom-xlsx") {
      const file = input.file; const fileName = String(file?.name || "").trim();
      const expectedBoardIds = Array.isArray(input.expectedBoardIds) ? input.expectedBoardIds.map((value) => String(value || "").trim()).filter(Boolean).sort() : null;
      const actualBoardIds = (directoryState.bomLists || []).map((bom) => String(bom?.id || "").trim()).filter(Boolean).sort();
      if (!file || typeof file.arrayBuffer !== "function" || !fileName || !/\.(xlsx|xls)$/i.test(fileName)) return { ok: false, message: "Выберите файл Excel в формате XLSX или XLS." };
      if (!expectedBoardIds || JSON.stringify(actualBoardIds) !== JSON.stringify(expectedBoardIds)) return { ok: false, message: "Список плат изменился в другом сеансе. Обновите экран и повторите импорт." };
      await importBomFromXlsxFile(file);
      const importedBom = getBomList(String(ui.activeBomId || "")); const importedRows = getBomImportRows(importedBom);
      if (!importedBom || importedBom.sourceFileName !== fileName || !importedRows.length) return { ok: false, message: "Владелец BOM не подтвердил импорт Excel." };
      queueMicrotask(() => { if (ui.activeModule === "nomenclature" && ui.activeNomenclaturePane === "boards") render({ skipRememberScroll: true }); });
      return { ok: true, id: importedBom.id, rowCount: importedRows.length };
    }
    if (command.type === "add-bom-nomenclature-row") {
      const bomId = String(input.bomId || "").trim(); const nomenclatureId = String(input.nomenclatureId || "").trim();
      const bom = getBomList(bomId); const rows = getBomImportRows(bom); const nomenclatureItem = getNomenclatureItem(nomenclatureId);
      const expectedRows = Array.isArray(input.expectedRows) && input.expectedRows.every((values) => Array.isArray(values))
        ? input.expectedRows.map((values) => normalizeBomImportRow({ values }).values)
        : null;
      if (!bom || !nomenclatureItem) return { ok: false, message: "Плата или позиция номенклатуры больше не существует." };
      if (normalizeLookupText(nomenclatureItem.type) !== normalizeLookupText("РЭА компоненты")) return { ok: false, message: "В BOM можно добавить только РЭА-компонент." };
      if (!expectedRows || JSON.stringify(rows.map((row) => rowSignature(row.values))) !== JSON.stringify(expectedRows.map(rowSignature))) return { ok: false, message: "Таблица BOM изменилась в другом сеансе. Обновите экран и повторите." };
      const previousRows = rows.map((row) => rowSignature(row.values));
      addNomenclatureToBom(bomId, nomenclatureId);
      const authoritativeRows = getBomImportRows(getBomList(bomId)); const appendedRow = authoritativeRows.at(-1);
      if (authoritativeRows.length !== rows.length + 1 || JSON.stringify(authoritativeRows.slice(0, -1).map((row) => rowSignature(row.values))) !== JSON.stringify(previousRows) || String(appendedRow?.nomenclatureId || "") !== nomenclatureId) return { ok: false, message: "Владелец BOM не подтвердил добавление строки." };
      queueMicrotask(() => { if (ui.activeModule === "nomenclature" && ui.activeNomenclaturePane === "boards") render({ skipRememberScroll: true }); });
      return { ok: true, id: `${bomId}:${authoritativeRows.length - 1}`, rowCount: authoritativeRows.length };
    }
    if (command.type === "update-bom-cell") {
      const bomId = String(input.bomId || "").trim(); const rowIndex = Number(input.rowIndex); const columnIndex = Number(input.columnIndex);
      const bom = getBomList(bomId); const rows = getBomImportRows(bom);
      const editableColumns = [0, 1, 2, 3, 4, 5, 7, 8];
      if (!bom || typeof input.rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) return { ok: false, message: "Строка BOM больше не существует." };
      if (typeof input.columnIndex !== "number" || !editableColumns.includes(columnIndex) || typeof input.value !== "string") return { ok: false, message: "Поле BOM недоступно для этой команды." };
      const expectedValues = Array.isArray(input.expectedValues) ? normalizeBomImportRow({ values: input.expectedValues }).values : null;
      if (!expectedValues || JSON.stringify(rowSignature(rows[rowIndex].values)) !== JSON.stringify(rowSignature(expectedValues))) return { ok: false, message: "Строка BOM изменилась в другом сеансе. Обновите экран и повторите." };
      const expectedNextValues = [...rows[rowIndex].values]; expectedNextValues[columnIndex] = input.value;
      const expectedNextRow = normalizeBomImportRow({ ...rows[rowIndex], values: expectedNextValues });
      updateBomImportCell(bomId, rowIndex, columnIndex, input.value);
      const authoritativeRow = getBomImportRows(getBomList(bomId))[rowIndex];
      if (!authoritativeRow || JSON.stringify(authoritativeRow.values) !== JSON.stringify(expectedNextRow.values)) return { ok: false, message: "Владелец BOM не подтвердил новое значение поля." };
      queueMicrotask(() => { if (ui.activeModule === "nomenclature" && ui.activeNomenclaturePane === "boards") render({ skipRememberScroll: true }); });
      return { ok: true, id: `${bomId}:${rowIndex}:${columnIndex}`, value: authoritativeRow.values[columnIndex] };
    }
    if (command.type === "update-bom-quantity") {
      const bomId = String(input.bomId || "").trim(); const rowIndex = Number(input.rowIndex); const rawQuantity = String(input.quantity ?? "").trim(); const quantity = Number(rawQuantity);
      const bom = getBomList(bomId); const rows = getBomImportRows(bom);
      if (!bom || typeof input.rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) return { ok: false, message: "Строка BOM больше не существует." };
      if (!rawQuantity || !Number.isInteger(quantity) || quantity < 0) return { ok: false, message: "Количество BOM должно быть целым неотрицательным числом." };
      const expectedValues = Array.isArray(input.expectedValues) ? normalizeBomImportRow({ values: input.expectedValues }).values : null;
      if (!expectedValues || JSON.stringify(rowSignature(rows[rowIndex].values)) !== JSON.stringify(rowSignature(expectedValues))) return { ok: false, message: "Строка BOM изменилась в другом сеансе. Обновите экран и повторите." };
      updateBomImportCell(bomId, rowIndex, 6, quantity);
      const authoritativeRow = getBomImportRows(getBomList(bomId))[rowIndex];
      if (!authoritativeRow || Number(authoritativeRow.quantity) !== quantity) return { ok: false, message: "Владелец BOM не подтвердил новое количество." };
      queueMicrotask(() => { if (ui.activeModule === "nomenclature" && ui.activeNomenclaturePane === "boards") render({ skipRememberScroll: true }); });
      return { ok: true, id: `${bomId}:${rowIndex}:quantity`, quantity };
    }
    if (command.type === "delete-bom-row") {
      const bomId = String(input.bomId || "").trim(); const rowIndex = Number(input.rowIndex);
      const bom = getBomList(bomId); const rows = getBomImportRows(bom);
      const expectedRows = Array.isArray(input.expectedRows) && input.expectedRows.every((values) => Array.isArray(values))
        ? input.expectedRows.map((values) => normalizeBomImportRow({ values }).values)
        : null;
      if (!bom || typeof input.rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) return { ok: false, message: "Строка BOM больше не существует." };
      if (!expectedRows || JSON.stringify(rows.map((row) => rowSignature(row.values))) !== JSON.stringify(expectedRows.map(rowSignature))) return { ok: false, message: "Таблица BOM изменилась в другом сеансе. Обновите экран и повторите." };
      const expectedRemaining = rows.filter((_, index) => index !== rowIndex).map((row) => rowSignature(row.values));
      deleteBomImportRow(bomId, rowIndex);
      const authoritativeRows = getBomImportRows(getBomList(bomId));
      if (JSON.stringify(authoritativeRows.map((row) => rowSignature(row.values))) !== JSON.stringify(expectedRemaining)) return { ok: false, message: "Владелец BOM не подтвердил удаление строки." };
      queueMicrotask(() => { if (ui.activeModule === "nomenclature" && ui.activeNomenclaturePane === "boards") render({ skipRememberScroll: true }); });
      return { ok: true, id: `${bomId}:${rowIndex}:deleted`, remainingRows: authoritativeRows.length };
    }
    if (command.type === "delete") {
      const result = await deleteBomCommand({ bomId: String(input.bomId || "") });
      return {
        ok: result?.ok === true,
        id: String(result?.id || ""),
        code: String(result?.code || ""),
        message: String(result?.message || ""),
      };
    }
    const result = await saveBomCommand({
      isNew: input.isNew === true,
      bomId: String(input.bomId || ""),
      name: String(input.name || ""),
      boardCode: String(input.boardCode || ""),
      resultItem: String(input.resultItem || ""),
    });
    return {
      ok: result?.ok === true,
      id: String(result?.id || ""),
      isNew: result?.isNew === true,
      code: String(result?.code || ""),
      message: String(result?.message || ""),
    };
  },
});
function getStructureEmployeesReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-structure-employees") === "1",
    readOnlyEvaluation: params.get("react-structure-employees-readonly") === "1",
    writeEvaluation: params.get("react-structure-employees-write") === "1",
  };
}
function isStructureEmployeesReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-structure-employees-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const structureEmployeesReactIslandHost = createStructureEmployeesReactIslandHost({
  getActivation: () => {
    const localQa = getStructureEmployeesReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_EMPLOYEES_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_EMPLOYEES === true || localQa.featureFlagEnabled,
      serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState),
      accessMode: localQa.writeEvaluation
        ? "write-evaluation"
        : (serverEvaluationAllowed && isStructureEmployeesReactEvaluationRequested()) || localQa.readOnlyEvaluation
          ? "read-only-evaluation"
          : "editor",
    };
  },
  getPayload: () => {
    const commandReady = getStructureEmployeesReactLocalQaOverrides().writeEvaluation
        && systemDomainsServerCommandState.status === "ready"
        && systemDomainsServerCommandState.enabled === true
        && systemDomainsServerCommandState.surfaces.includes("production-structure")
        && canEditSystemDomainRegistry("employees");
    return { ...systemDomainsState, capabilities: { createEdit: commandReady, archive: commandReady } };
  },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, registryId) => {
    setProductionStructureMatrixActiveRegistry(registryId || "employees");
    if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getStructureEmployeesReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !["save", "archive", "reactivate"].includes(command.type)) {
      return { ok: false, message: "Команда редактирования сотрудников недоступна." };
    }
    if (systemDomainsServerReadState.status !== "server"
      || systemDomainsServerCommandState.status !== "ready"
      || systemDomainsServerCommandState.enabled !== true
      || !systemDomainsServerCommandState.surfaces.includes("production-structure")
      || !canEditSystemDomainRegistry("employees")) {
      return { ok: false, message: "PostgreSQL-команда или право редактирования сотрудников недоступны." };
    }
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "reactivate") {
      const employeeId = String(input.employeeId || "").trim();
      const employee = (getSystemDomainsRegistries().employees || []).find((row) => row.id === employeeId);
      if (!employee || employee.isActive !== false) return { ok: false, message: "Архивный сотрудник больше не существует." };
      try {
        const result = await upsertSystemDomainEntity("employees", { ...employee, isActive: true, archivedAt: "" }, { source: "react:structure-employees:reactivate", operation: "update", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Восстановление сотрудника отклонено проверкой System Domains." };
        const authoritativeEmployee = (getSystemDomainsRegistries().employees || []).find((row) => row.id === employeeId);
        if (!authoritativeEmployee || authoritativeEmployee.isActive === false || authoritativeEmployee.archivedAt) return { ok: false, message: "Владелец сотрудников не подтвердил восстановление." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: employeeId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные сотрудника изменились в другом сеансе. Проверьте значения и повторите восстановление." : error?.message || "Сервер не принял восстановление сотрудника." };
      }
    }
    if (command.type === "archive") {
      const employeeId = String(input.employeeId || "").trim();
      const registries = getSystemDomainsRegistries();
      const employee = (registries.employees || []).find((row) => row.id === employeeId);
      if (!employee || employee.isActive === false) return { ok: false, message: "Активный сотрудник больше не существует." };
      const hasActiveDependency = (registries.employmentAssignments || []).some((row) => row.employeeId === employeeId && row.isPrimary === false && !row.validTo)
        || (registries.scheduleAssignments || []).some((row) => row.employeeId === employeeId && !row.validTo)
        || (registries.roleAssignments || []).some((row) => row.employeeId === employeeId)
        || (registries.responsibilityPolicies || []).some((row) => row.isActive !== false && (row.subjectEmployeeId === employeeId || (row.targetEmployeeIds || []).includes(employeeId)));
      if (hasActiveDependency) return { ok: false, message: "Нельзя архивировать сотрудника с действующими назначениями доступа, графика или ответственности." };
      try {
        const result = await archiveSystemDomainEntity("employees", employeeId, { source: "react:structure-employees:archive", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Архивирование сотрудника отклонено проверкой System Domains." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: employeeId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные сотрудника изменились в другом сеансе. Проверьте значения и повторите архивирование." : error?.message || "Сервер не принял архивирование сотрудника." };
      }
    }
    const employeeId = String(input.employeeId || "").trim() || makeId("employee");
    const displayName = String(input.displayName || "").trim().replace(/\s+/g, " ");
    const positionId = String(input.positionId || "").trim();
    const orgUnitId = String(input.orgUnitId || "").trim();
    const workCenterId = String(input.workCenterId || "").trim();
    const registries = getSystemDomainsRegistries();
    const currentEmployee = (registries.employees || []).find((row) => row.id === employeeId);
    if ((!currentEmployee && input.isActive === false) || (currentEmployee && (currentEmployee.isActive !== false) !== (input.isActive !== false))) return { ok: false, message: "Статус сотрудника меняется только отдельной lifecycle-командой." };
    if (!displayName || !positionId || !orgUnitId) return { ok: false, message: "Заполните ФИО, должность и подразделение." };
    if (!(registries.positions || []).some((row) => row.id === positionId)) return { ok: false, message: "Выбранная должность больше не существует." };
    if (!(registries.orgUnits || []).some((row) => row.id === orgUnitId)) return { ok: false, message: "Выбранное подразделение больше не существует." };
    if (workCenterId && !(registries.workCenters || []).some((row) => row.id === workCenterId)) return { ok: false, message: "Выбранный рабочий центр больше не существует." };
    try {
      const result = await upsertSystemDomainEntity("employees", {
        id: employeeId,
        displayName,
        personnelNumber: String(input.personnelNumber || "").trim(),
        isActive: input.isActive !== false,
        employmentAssignment: {
          id: `employment:${employeeId}`,
          employeeId,
          positionId,
          orgUnitId,
          workCenterId,
          validFrom: String(input.validFrom || "").trim(),
          validTo: String(input.validTo || "").trim(),
          isPrimary: true,
        },
      }, { source: "react:structure-employees", operation: input.isNew === true ? "create" : "update", serverCommand: true, surface: "production-structure" });
      if (result !== true) return { ok: false, message: "Изменение сотрудника отклонено проверкой System Domains." };
      queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
      return { ok: true, id: employeeId };
    } catch (error) {
      return {
        ok: false,
        message: error?.conflict === true
          ? "Данные сотрудника изменились в другом сеансе. Проверьте значения и повторите сохранение."
          : error?.message || "Сервер не принял изменение сотрудника.",
      };
    }
  },
});
function getStructurePositionsReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-structure-positions") === "1", readOnlyEvaluation: params.get("react-structure-positions-readonly") === "1", writeEvaluation: params.get("react-structure-positions-write") === "1" };
}
function isStructurePositionsReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-structure-positions-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const structurePositionsReactIslandHost = createStructurePositionsReactIslandHost({
  getActivation: () => {
    const localQa = getStructurePositionsReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_POSITIONS_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_POSITIONS === true || localQa.featureFlagEnabled,
      serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState),
      accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isStructurePositionsReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor",
    };
  },
  getPayload: () => { const commandReady = getStructurePositionsReactLocalQaOverrides().writeEvaluation && systemDomainsServerCommandState.status === "ready" && systemDomainsServerCommandState.enabled === true && systemDomainsServerCommandState.surfaces.includes("production-structure") && canEditSystemDomainRegistry("positions"); return { ...systemDomainsState, capabilities: { createEdit: commandReady, archive: commandReady } }; },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, registryId) => {
    setProductionStructureMatrixActiveRegistry(registryId || "positions");
    if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getStructurePositionsReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !["save", "archive", "reactivate"].includes(command.type)) return { ok: false, message: "Команда должностей недоступна." };
    if (systemDomainsServerReadState.status !== "server" || systemDomainsServerCommandState.status !== "ready" || systemDomainsServerCommandState.enabled !== true || !systemDomainsServerCommandState.surfaces.includes("production-structure") || !canEditSystemDomainRegistry("positions")) return { ok: false, message: "PostgreSQL-команда или право редактирования должностей недоступны." };
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "reactivate") {
      const positionId = String(input.positionId || "").trim(); const registries = getSystemDomainsRegistries();
      const position = (registries.positions || []).find((row) => row.id === positionId);
      if (!position || position.isActive !== false) return { ok: false, message: "Архивная должность больше не существует." };
      const orgUnitId = String(position.orgUnitId || "").trim(); const workCenterId = String(position.workCenterId || "").trim(); const defaultScheduleTemplateId = String(position.defaultScheduleTemplateId || "").trim();
      if (orgUnitId && !(registries.orgUnits || []).some((row) => row.id === orgUnitId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите подразделение должности." };
      if (workCenterId && !(registries.workCenters || []).some((row) => row.id === workCenterId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите рабочий центр должности." };
      if (defaultScheduleTemplateId && !(registries.scheduleTemplates || []).some((row) => row.id === defaultScheduleTemplateId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите базовый график должности." };
      try {
        const result = await upsertSystemDomainEntity("positions", { ...position, isActive: true, archivedAt: "" }, { source: "react:structure-positions:reactivate", operation: "update", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Восстановление должности отклонено проверкой System Domains." };
        const authoritativePosition = (getSystemDomainsRegistries().positions || []).find((row) => row.id === positionId);
        if (!authoritativePosition || authoritativePosition.isActive === false || authoritativePosition.archivedAt) return { ok: false, message: "Владелец должностей не подтвердил восстановление." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: positionId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные должности изменились в другом сеансе. Проверьте значения и повторите восстановление." : error?.message || "Сервер не принял восстановление должности." };
      }
    }
    if (command.type === "archive") {
      const positionId = String(input.positionId || "").trim();
      const position = (getSystemDomainsRegistries().positions || []).find((row) => row.id === positionId);
      if (!position || position.isActive === false) return { ok: false, message: "Активная должность больше не существует." };
      const activeAssignment = (getSystemDomainsRegistries().employmentAssignments || []).find((assignment) => assignment.positionId === positionId && assignment.isActive !== false && !assignment.validTo);
      if (activeAssignment) return { ok: false, message: "Нельзя архивировать должность с действующим назначением сотрудника." };
      try {
        const result = await archiveSystemDomainEntity("positions", positionId, { source: "react:structure-positions:archive", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Архивирование должности отклонено проверкой System Domains." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: positionId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные должности изменились в другом сеансе. Проверьте значения и повторите архивирование." : error?.message || "Сервер не принял архивирование должности." };
      }
    }
    const positionId = String(input.positionId || "").trim() || makeId("position");
    const name = String(input.name || "").trim().replace(/\s+/g, " ");
    const kind = String(input.kind || "worker").trim();
    const orgUnitId = String(input.orgUnitId || "").trim();
    const workCenterId = String(input.workCenterId || "").trim();
    const defaultScheduleTemplateId = String(input.defaultScheduleTemplateId || "").trim();
    const registries = getSystemDomainsRegistries();
    const currentPosition = (registries.positions || []).find((row) => row.id === positionId);
    if (input.isNew !== true && !currentPosition) return { ok: false, message: "Должность больше не существует." };
    if (!name) return { ok: false, message: "Заполните название должности." };
    if (!["manager", "supervisor", "worker"].includes(kind)) return { ok: false, message: "Выбрана неизвестная категория должности." };
    if (orgUnitId && !(registries.orgUnits || []).some((row) => row.id === orgUnitId)) return { ok: false, message: "Выбранное подразделение больше не существует." };
    if (workCenterId && !(registries.workCenters || []).some((row) => row.id === workCenterId)) return { ok: false, message: "Выбранный рабочий центр больше не существует." };
    if (defaultScheduleTemplateId && !(registries.scheduleTemplates || []).some((row) => row.id === defaultScheduleTemplateId)) return { ok: false, message: "Выбранный базовый график больше не существует." };
    try {
      const result = await upsertSystemDomainEntity("positions", { id: positionId, name, code: String(input.code || "").trim(), kind, orgUnitId, workCenterId, defaultScheduleTemplateId, isActive: currentPosition?.isActive !== false }, { source: "react:structure-positions", operation: input.isNew === true ? "create" : "update", serverCommand: true, surface: "production-structure" });
      if (result !== true) return { ok: false, message: "Изменение должности отклонено проверкой System Domains." };
      queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
      return { ok: true, id: positionId };
    } catch (error) {
      return { ok: false, message: error?.conflict === true ? "Данные должности изменились в другом сеансе. Проверьте значения и повторите сохранение." : error?.message || "Сервер не принял изменение должности." };
    }
  },
});
function getStructureOrgUnitsReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-structure-org-units") === "1", readOnlyEvaluation: params.get("react-structure-org-units-readonly") === "1", writeEvaluation: params.get("react-structure-org-units-write") === "1" };
}
function isStructureOrgUnitsReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-structure-org-units-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const structureOrgUnitsReactIslandHost = createStructureOrgUnitsReactIslandHost({
  getActivation: () => {
    const localQa = getStructureOrgUnitsReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_ORG_UNITS_READ_ONLY_EVALUATION === true;
    return { featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_ORG_UNITS === true || localQa.featureFlagEnabled, serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState), accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isStructureOrgUnitsReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor" };
  },
  getPayload: () => { const commandReady = getStructureOrgUnitsReactLocalQaOverrides().writeEvaluation && systemDomainsServerCommandState.status === "ready" && systemDomainsServerCommandState.enabled === true && systemDomainsServerCommandState.surfaces.includes("production-structure") && canEditSystemDomainRegistry("orgUnits"); return { ...systemDomainsState, capabilities: { createEdit: commandReady, archive: commandReady } }; },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, registryId) => { setProductionStructureMatrixActiveRegistry(registryId || "orgUnits"); if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); },
  executeCommand: async (command = {}) => {
    const localQa = getStructureOrgUnitsReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !["save", "archive", "reactivate"].includes(command.type)) return { ok: false, message: "Команда подразделений недоступна." };
    if (systemDomainsServerReadState.status !== "server" || systemDomainsServerCommandState.status !== "ready" || systemDomainsServerCommandState.enabled !== true || !systemDomainsServerCommandState.surfaces.includes("production-structure") || !canEditSystemDomainRegistry("orgUnits")) return { ok: false, message: "PostgreSQL-команда или право редактирования подразделений недоступны." };
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "reactivate") {
      const orgUnitId = String(input.orgUnitId || "").trim();
      const registries = getSystemDomainsRegistries();
      const orgUnit = (registries.orgUnits || []).find((row) => row.id === orgUnitId);
      if (!orgUnit || orgUnit.isActive !== false) return { ok: false, message: "Архивное подразделение больше не существует." };
      const parentOrgUnitId = String(orgUnit.parentOrgUnitId || "").trim();
      if (parentOrgUnitId && !(registries.orgUnits || []).some((row) => row.id === parentOrgUnitId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите родительское подразделение." };
      try {
        const result = await upsertSystemDomainEntity("orgUnits", { ...orgUnit, isActive: true, archivedAt: "" }, { source: "react:structure-org-units:reactivate", operation: "update", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Восстановление подразделения отклонено проверкой System Domains." };
        const authoritativeOrgUnit = (getSystemDomainsRegistries().orgUnits || []).find((row) => row.id === orgUnitId);
        if (!authoritativeOrgUnit || authoritativeOrgUnit.isActive === false || authoritativeOrgUnit.archivedAt) return { ok: false, message: "Владелец подразделений не подтвердил восстановление." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: orgUnitId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные подразделения изменились в другом сеансе. Проверьте значения и повторите восстановление." : error?.message || "Сервер не принял восстановление подразделения." };
      }
    }
    if (command.type === "archive") {
      const orgUnitId = String(input.orgUnitId || "").trim();
      const registries = getSystemDomainsRegistries();
      const orgUnit = (registries.orgUnits || []).find((row) => row.id === orgUnitId);
      if (!orgUnit || orgUnit.isActive === false) return { ok: false, message: "Активное подразделение больше не существует." };
      const hasActiveReference = (registries.orgUnits || []).some((row) => row.parentOrgUnitId === orgUnitId && row.isActive !== false)
        || (registries.workCenters || []).some((row) => row.orgUnitId === orgUnitId && row.isActive !== false)
        || (registries.positions || []).some((row) => row.orgUnitId === orgUnitId && row.isActive !== false)
        || (registries.equipment || []).some((row) => row.orgUnitId === orgUnitId && row.isActive !== false)
        || (registries.employmentAssignments || []).some((row) => row.orgUnitId === orgUnitId && row.isActive !== false && !row.validTo);
      if (hasActiveReference) return { ok: false, message: "Нельзя архивировать подразделение с действующими дочерними или производственными ссылками." };
      try {
        const result = await archiveSystemDomainEntity("orgUnits", orgUnitId, { source: "react:structure-org-units:archive", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Архивирование подразделения отклонено проверкой System Domains." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: orgUnitId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные подразделения изменились в другом сеансе. Проверьте значения и повторите архивирование." : error?.message || "Сервер не принял архивирование подразделения." };
      }
    }
    const orgUnitId = String(input.orgUnitId || "").trim() || makeId("org-unit");
    const name = String(input.name || "").trim().replace(/\s+/g, " ");
    const kind = String(input.kind || "department").trim();
    const parentOrgUnitId = String(input.parentOrgUnitId || "").trim();
    const orgUnits = getSystemDomainsRegistries().orgUnits || [];
    const currentOrgUnit = orgUnits.find((row) => row.id === orgUnitId);
    if (input.isNew !== true && !currentOrgUnit) return { ok: false, message: "Подразделение больше не существует." };
    if (!name) return { ok: false, message: "Заполните название подразделения." };
    if (!["department", "section"].includes(kind)) return { ok: false, message: "Выбран неизвестный тип подразделения." };
    if (parentOrgUnitId && !orgUnits.some((row) => row.id === parentOrgUnitId)) return { ok: false, message: "Выбранное родительское подразделение больше не существует." };
    if (parentOrgUnitId === orgUnitId) return { ok: false, message: "Подразделение не может быть родителем самого себя." };
    const parents = new Map(orgUnits.map((row) => [String(row.id || ""), String(row.parentOrgUnitId || "")]));
    let ancestorId = parentOrgUnitId;
    const visited = new Set();
    while (ancestorId && !visited.has(ancestorId)) {
      if (ancestorId === orgUnitId) return { ok: false, message: "Выбранный родитель создаёт цикл в иерархии подразделений." };
      visited.add(ancestorId);
      ancestorId = parents.get(ancestorId) || "";
    }
    try {
      const result = await upsertSystemDomainEntity("orgUnits", { id: orgUnitId, name, code: String(input.code || "").trim(), kind, parentOrgUnitId, isActive: currentOrgUnit?.isActive !== false }, { source: "react:structure-org-units", operation: input.isNew === true ? "create" : "update", serverCommand: true, surface: "production-structure" });
      if (result !== true) return { ok: false, message: "Изменение подразделения отклонено проверкой System Domains." };
      queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
      return { ok: true, id: orgUnitId };
    } catch (error) {
      return { ok: false, message: error?.conflict === true ? "Данные подразделения изменились в другом сеансе. Проверьте значения и повторите сохранение." : error?.message || "Сервер не принял изменение подразделения." };
    }
  },
});
function getStructureWorkCentersReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]); if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search); if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-structure-work-centers") === "1", readOnlyEvaluation: params.get("react-structure-work-centers-readonly") === "1", writeEvaluation: params.get("react-structure-work-centers-write") === "1" };
}
function isStructureWorkCentersReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search); if (params.get("react-structure-work-centers-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const structureWorkCentersReactIslandHost = createStructureWorkCentersReactIslandHost({
  getActivation: () => {
    const localQa = getStructureWorkCentersReactLocalQaOverrides(); const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_WORK_CENTERS_READ_ONLY_EVALUATION === true;
    return { featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_WORK_CENTERS === true || localQa.featureFlagEnabled, serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState), accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isStructureWorkCentersReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor" };
  },
  getPayload: () => { const commandReady = getStructureWorkCentersReactLocalQaOverrides().writeEvaluation && systemDomainsServerCommandState.status === "ready" && systemDomainsServerCommandState.enabled === true && systemDomainsServerCommandState.surfaces.includes("production-structure") && canEditSystemDomainRegistry("workCenters"); return { ...systemDomainsState, capabilities: { createEdit: commandReady, archive: commandReady } }; }, getTargetRoot: () => app,
  requestLegacyRender: (_reason, registryId) => { setProductionStructureMatrixActiveRegistry(registryId || "workCenters"); if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); },
  executeCommand: async (command = {}) => {
    const localQa = getStructureWorkCentersReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !["save", "archive", "reactivate"].includes(command.type)) return { ok: false, message: "Команда рабочего центра недоступна." };
    if (systemDomainsServerReadState.status !== "server" || systemDomainsServerCommandState.status !== "ready" || systemDomainsServerCommandState.enabled !== true || !systemDomainsServerCommandState.surfaces.includes("production-structure") || !canEditSystemDomainRegistry("workCenters")) return { ok: false, message: "PostgreSQL-команда или право редактирования рабочих центров недоступны." };
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "reactivate") {
      const workCenterId = String(input.workCenterId || "").trim(); const registries = getSystemDomainsRegistries();
      const workCenter = (registries.workCenters || []).find((row) => row.id === workCenterId);
      if (!workCenter || workCenter.isActive !== false) return { ok: false, message: "Архивный рабочий центр больше не существует." };
      const orgUnitId = String(workCenter.orgUnitId || "").trim(); const parentWorkCenterId = String(workCenter.parentWorkCenterId || "").trim();
      if (orgUnitId && !(registries.orgUnits || []).some((row) => row.id === orgUnitId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите подразделение рабочего центра." };
      if (parentWorkCenterId && !(registries.workCenters || []).some((row) => row.id === parentWorkCenterId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите родительский рабочий центр." };
      try {
        const result = await upsertSystemDomainEntity("workCenters", { ...workCenter, isActive: true, archivedAt: "" }, { source: "react:structure-work-centers:reactivate", operation: "update", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Восстановление рабочего центра отклонено проверкой System Domains." };
        const authoritativeWorkCenter = (getSystemDomainsRegistries().workCenters || []).find((row) => row.id === workCenterId);
        if (!authoritativeWorkCenter || authoritativeWorkCenter.isActive === false || authoritativeWorkCenter.archivedAt) return { ok: false, message: "Владелец рабочих центров не подтвердил восстановление." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: workCenterId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные рабочего центра изменились в другом сеансе. Проверьте значения и повторите восстановление." : error?.message || "Сервер не принял восстановление рабочего центра." };
      }
    }
    if (command.type === "archive") {
      const workCenterId = String(input.workCenterId || "").trim(); const registries = getSystemDomainsRegistries();
      const workCenter = (registries.workCenters || []).find((row) => row.id === workCenterId);
      if (!workCenter || workCenter.isActive === false) return { ok: false, message: "Активный рабочий центр больше не существует." };
      const hasActiveReference = (registries.workCenters || []).some((row) => row.parentWorkCenterId === workCenterId && row.isActive !== false)
        || (registries.positions || []).some((row) => row.workCenterId === workCenterId && row.isActive !== false)
        || (registries.equipment || []).some((row) => row.workCenterId === workCenterId && row.isActive !== false)
        || (registries.employmentAssignments || []).some((row) => row.workCenterId === workCenterId && row.isActive !== false && !row.validTo);
      if (hasActiveReference) return { ok: false, message: "Нельзя архивировать рабочий центр с действующими дочерними или производственными ссылками." };
      try {
        const result = await archiveSystemDomainEntity("workCenters", workCenterId, { source: "react:structure-work-centers:archive", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Архивирование рабочего центра отклонено проверкой System Domains." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: workCenterId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные рабочего центра изменились в другом сеансе. Проверьте значения и повторите архивирование." : error?.message || "Сервер не принял архивирование рабочего центра." };
      }
    }
    const workCenterId = String(input.workCenterId || "").trim() || makeId("work-center");
    const name = String(input.name || "").trim().replace(/\s+/g, " ");
    const orgUnitId = String(input.orgUnitId || "").trim();
    const parentWorkCenterId = String(input.parentWorkCenterId || "").trim();
    const registries = getSystemDomainsRegistries(); const workCenters = registries.workCenters || [];
    const currentWorkCenter = workCenters.find((row) => row.id === workCenterId);
    if (input.isNew !== true && !currentWorkCenter) return { ok: false, message: "Рабочий центр больше не существует." };
    if (!name) return { ok: false, message: "Заполните название рабочего центра." };
    if (orgUnitId && !(registries.orgUnits || []).some((row) => row.id === orgUnitId)) return { ok: false, message: "Выбранное подразделение больше не существует." };
    if (parentWorkCenterId && !workCenters.some((row) => row.id === parentWorkCenterId)) return { ok: false, message: "Выбранный родительский рабочий центр больше не существует." };
    if (parentWorkCenterId === workCenterId) return { ok: false, message: "Рабочий центр не может быть родителем самому себе." };
    const parents = new Map(workCenters.map((row) => [String(row.id || ""), String(row.parentWorkCenterId || "")])); let ancestorId = parentWorkCenterId; const visited = new Set();
    while (ancestorId && !visited.has(ancestorId)) { if (ancestorId === workCenterId) return { ok: false, message: "Выбранный родитель создаёт цикл в иерархии рабочих центров." }; visited.add(ancestorId); ancestorId = parents.get(ancestorId) || ""; }
    try {
      const result = await upsertSystemDomainEntity("workCenters", { id: workCenterId, name, code: String(input.code || "").trim(), orgUnitId, parentWorkCenterId, participatesInPlanning: input.participatesInPlanning !== false, showInGantt: input.showInGantt !== false, isActive: currentWorkCenter?.isActive !== false }, { source: "react:structure-work-centers", operation: input.isNew === true ? "create" : "update", serverCommand: true, surface: "production-structure" });
      if (result !== true) return { ok: false, message: "Изменение рабочего центра отклонено проверкой System Domains." };
      queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
      return { ok: true, id: workCenterId };
    } catch (error) {
      return { ok: false, message: error?.conflict === true ? "Данные рабочего центра изменились в другом сеансе. Проверьте значения и повторите сохранение." : error?.message || "Сервер не принял изменение рабочего центра." };
    }
  },
});
function getStructureEquipmentReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]); if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search); if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-structure-equipment") === "1", readOnlyEvaluation: params.get("react-structure-equipment-readonly") === "1", writeEvaluation: params.get("react-structure-equipment-write") === "1" };
}
function isStructureEquipmentReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search); if (params.get("react-structure-equipment-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const structureEquipmentReactIslandHost = createStructureEquipmentReactIslandHost({
  getActivation: () => {
    const localQa = getStructureEquipmentReactLocalQaOverrides(); const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_EQUIPMENT_READ_ONLY_EVALUATION === true;
    return { featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_EQUIPMENT === true || localQa.featureFlagEnabled, serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState), accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isStructureEquipmentReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor" };
  },
  getPayload: () => { const commandReady = getStructureEquipmentReactLocalQaOverrides().writeEvaluation && systemDomainsServerCommandState.status === "ready" && systemDomainsServerCommandState.enabled === true && systemDomainsServerCommandState.surfaces.includes("production-structure") && canEditSystemDomainRegistry("equipment"); return { ...systemDomainsState, capabilities: { createEdit: commandReady, archive: commandReady } }; }, getTargetRoot: () => app,
  requestLegacyRender: (_reason, registryId) => { setProductionStructureMatrixActiveRegistry(registryId || "equipment"); if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); },
  executeCommand: async (command = {}) => {
    const localQa = getStructureEquipmentReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !["save", "archive", "reactivate"].includes(command.type)) return { ok: false, message: "Команда оборудования недоступна." };
    if (systemDomainsServerReadState.status !== "server" || systemDomainsServerCommandState.status !== "ready" || systemDomainsServerCommandState.enabled !== true || !systemDomainsServerCommandState.surfaces.includes("production-structure") || !canEditSystemDomainRegistry("equipment")) return { ok: false, message: "PostgreSQL-команда или право редактирования оборудования недоступны." };
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "reactivate") {
      const equipmentId = String(input.equipmentId || "").trim(); const registries = getSystemDomainsRegistries();
      const equipment = (registries.equipment || []).find((row) => row.id === equipmentId);
      if (!equipment || equipment.isActive !== false) return { ok: false, message: "Архивное оборудование больше не существует." };
      const orgUnitId = String(equipment.orgUnitId || "").trim(); const workCenterId = String(equipment.workCenterId || "").trim(); const scheduleTemplateId = String(equipment.scheduleTemplateId || "").trim();
      if (orgUnitId && !(registries.orgUnits || []).some((row) => row.id === orgUnitId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите подразделение оборудования." };
      if (workCenterId && !(registries.workCenters || []).some((row) => row.id === workCenterId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите рабочий центр оборудования." };
      if (scheduleTemplateId && !(registries.scheduleTemplates || []).some((row) => row.id === scheduleTemplateId && row.isActive !== false)) return { ok: false, message: "Сначала восстановите график оборудования." };
      try {
        const result = await upsertSystemDomainEntity("equipment", { ...equipment, isActive: true, archivedAt: "" }, { source: "react:structure-equipment:reactivate", operation: "update", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Восстановление оборудования отклонено проверкой System Domains." };
        const authoritativeEquipment = (getSystemDomainsRegistries().equipment || []).find((row) => row.id === equipmentId);
        if (!authoritativeEquipment || authoritativeEquipment.isActive === false || authoritativeEquipment.archivedAt) return { ok: false, message: "Владелец оборудования не подтвердил восстановление." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: equipmentId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные оборудования изменились в другом сеансе. Проверьте значения и повторите восстановление." : error?.message || "Сервер не принял восстановление оборудования." };
      }
    }
    if (command.type === "archive") {
      const equipmentId = String(input.equipmentId || "").trim();
      const equipment = (getSystemDomainsRegistries().equipment || []).find((row) => row.id === equipmentId);
      if (!equipment || equipment.isActive === false) return { ok: false, message: "Активное оборудование больше не существует." };
      try {
        const result = await archiveSystemDomainEntity("equipment", equipmentId, { source: "react:structure-equipment:archive", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Архивирование оборудования отклонено проверкой System Domains." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: equipmentId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные оборудования изменились в другом сеансе. Проверьте значения и повторите архивирование." : error?.message || "Сервер не принял архивирование оборудования." };
      }
    }
    const equipmentId = String(input.equipmentId || "").trim() || makeId("equipment");
    const name = String(input.name || "").trim().replace(/\s+/g, " ");
    const orgUnitId = String(input.orgUnitId || "").trim();
    const workCenterId = String(input.workCenterId || "").trim();
    const scheduleTemplateId = String(input.scheduleTemplateId || "").trim();
    const quantity = Number(input.quantity);
    const registries = getSystemDomainsRegistries();
    const currentEquipment = (registries.equipment || []).find((row) => row.id === equipmentId);
    if (input.isNew !== true && !currentEquipment) return { ok: false, message: "Оборудование больше не существует." };
    if (!name) return { ok: false, message: "Заполните название оборудования." };
    if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, message: "Количество оборудования должно быть целым неотрицательным числом." };
    if (orgUnitId && !(registries.orgUnits || []).some((row) => row.id === orgUnitId)) return { ok: false, message: "Выбранное подразделение больше не существует." };
    if (workCenterId && !(registries.workCenters || []).some((row) => row.id === workCenterId)) return { ok: false, message: "Выбранный рабочий центр больше не существует." };
    if (scheduleTemplateId && !(registries.scheduleTemplates || []).some((row) => row.id === scheduleTemplateId)) return { ok: false, message: "Выбранный график больше не существует." };
    try {
      const result = await upsertSystemDomainEntity("equipment", { id: equipmentId, name, code: String(input.code || "").trim(), orgUnitId, workCenterId, quantity, scheduleTemplateId, isActive: currentEquipment?.isActive !== false }, { source: "react:structure-equipment", operation: input.isNew === true ? "create" : "update", serverCommand: true, surface: "production-structure" });
      if (result !== true) return { ok: false, message: "Изменение оборудования отклонено проверкой System Domains." };
      queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
      return { ok: true, id: equipmentId };
    } catch (error) {
      return { ok: false, message: error?.conflict === true ? "Данные оборудования изменились в другом сеансе. Проверьте значения и повторите сохранение." : error?.message || "Сервер не принял изменение оборудования." };
    }
  },
});
function getStructureResponsibilityPoliciesReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]); if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search); if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-structure-responsibility-policies") === "1", readOnlyEvaluation: params.get("react-structure-responsibility-policies-readonly") === "1", writeEvaluation: params.get("react-structure-responsibility-policies-write") === "1" };
}
function isStructureResponsibilityPoliciesReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search); if (params.get("react-structure-responsibility-policies-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const structureResponsibilityPoliciesReactIslandHost = createStructureResponsibilityPoliciesReactIslandHost({
  getActivation: () => {
    const localQa = getStructureResponsibilityPoliciesReactLocalQaOverrides(); const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES_READ_ONLY_EVALUATION === true;
    return { featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_RESPONSIBILITY_POLICIES === true || localQa.featureFlagEnabled, serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState), accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isStructureResponsibilityPoliciesReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor" };
  },
  getPayload: () => { const commandReady = getStructureResponsibilityPoliciesReactLocalQaOverrides().writeEvaluation && systemDomainsServerCommandState.status === "ready" && systemDomainsServerCommandState.enabled === true && systemDomainsServerCommandState.surfaces.includes("production-structure") && canEditSystemDomainRegistry("responsibilityPolicies"); return { ...systemDomainsState, capabilities: { createEdit: commandReady, archive: commandReady } }; }, getTargetRoot: () => app,
  requestLegacyRender: (_reason, registryId) => { setProductionStructureMatrixActiveRegistry(registryId || "responsibilityPolicies"); if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); },
  executeCommand: async (command = {}) => {
    const localQa = getStructureResponsibilityPoliciesReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !["save", "archive", "reactivate"].includes(command.type)) return { ok: false, message: "Команда жизненного цикла зон ответственности недоступна." };
    if (systemDomainsServerReadState.status !== "server" || systemDomainsServerCommandState.status !== "ready" || systemDomainsServerCommandState.enabled !== true || !systemDomainsServerCommandState.surfaces.includes("production-structure") || !canEditSystemDomainRegistry("responsibilityPolicies")) return { ok: false, message: "PostgreSQL-команда или право редактирования зон ответственности недоступны." };
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "archive") {
      const policyId = String(input.policyId || "").trim();
      const policy = (getSystemDomainsRegistries().responsibilityPolicies || []).find((item) => item.id === policyId);
      if (!policy || policy.isActive === false) return { ok: false, message: "Активная зона ответственности больше не существует." };
      try {
        const result = await archiveSystemDomainEntity("responsibilityPolicies", policyId, { source: "react:structure-responsibility-policies:archive", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Архивирование зоны ответственности отклонено проверкой System Domains." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: policyId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные зоны ответственности изменились в другом сеансе. Проверьте значения и повторите архивирование." : error?.message || "Сервер не принял архивирование зоны ответственности." };
      }
    }
    if (command.type === "reactivate") {
      const policyId = String(input.policyId || "").trim();
      const policy = (getSystemDomainsRegistries().responsibilityPolicies || []).find((item) => item.id === policyId);
      if (!policy || policy.isActive !== false) return { ok: false, message: "Архивная зона ответственности больше не существует." };
      const employeeIds = new Set((getSystemDomainsRegistries().employees || []).filter((employee) => employee.isActive !== false).map((employee) => String(employee.id || "")).filter(Boolean));
      if (!employeeIds.has(String(policy.subjectEmployeeId || "")) || (policy.targetEmployeeIds || []).some((employeeId) => !employeeIds.has(String(employeeId || "")))) return { ok: false, message: "Сначала восстановите сотрудников, связанных с зоной ответственности." };
      try {
        const result = await upsertSystemDomainEntity("responsibilityPolicies", { ...policy, isActive: true, archivedAt: "", updatedAt: new Date().toISOString() }, { source: "react:structure-responsibility-policies:reactivate", operation: "update", serverCommand: true, surface: "production-structure" });
        if (result !== true) return { ok: false, message: "Восстановление зоны ответственности отклонено проверкой System Domains." };
        const authoritativePolicy = (getSystemDomainsRegistries().responsibilityPolicies || []).find((item) => item.id === policyId);
        if (!authoritativePolicy || authoritativePolicy.isActive === false || authoritativePolicy.archivedAt) return { ok: false, message: "Владелец зон ответственности не подтвердил восстановление." };
        queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
        return { ok: true, id: policyId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Данные зоны ответственности изменились в другом сеансе. Проверьте значения и повторите восстановление." : error?.message || "Сервер не принял восстановление зоны ответственности." };
      }
    }
    const subjectEmployeeId = String(input.subjectEmployeeId || "").trim();
    const policyId = String(input.policyId || "").trim() || `responsibility:${subjectEmployeeId}`;
    const mode = String(input.mode || "department").trim();
    const targetEmployeeIds = [...new Set((Array.isArray(input.targetEmployeeIds) ? input.targetEmployeeIds : []).map((id) => String(id || "").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "en"));
    const registries = getSystemDomainsRegistries();
    const employeeIds = new Set((registries.employees || []).map((employee) => String(employee.id || "")).filter(Boolean));
    if (!subjectEmployeeId || !employeeIds.has(subjectEmployeeId)) return { ok: false, message: "Выбранный мастер больше не существует." };
    if (!["department", "workCenter", "manual", "all"].includes(mode)) return { ok: false, message: "Выбран неизвестный режим зоны ответственности." };
    const missingTargetId = targetEmployeeIds.find((employeeId) => !employeeIds.has(employeeId));
    if (missingTargetId) return { ok: false, message: "Один из разрешённых сотрудников больше не существует." };
    if ((registries.responsibilityPolicies || []).some((policy) => policy.id !== policyId && policy.subjectEmployeeId === subjectEmployeeId)) return { ok: false, message: "Для выбранного мастера уже существует зона ответственности." };
    try {
      const currentPolicy = (registries.responsibilityPolicies || []).find((policy) => policy.id === policyId);
      const result = await upsertSystemDomainEntity("responsibilityPolicies", { ...currentPolicy, id: policyId, subjectEmployeeId, mode, targetEmployeeIds, updatedAt: new Date().toISOString(), isActive: currentPolicy?.isActive !== false }, { source: "react:structure-responsibility-policies", operation: input.isNew === true ? "create" : "update", serverCommand: true, surface: "production-structure" });
      if (result !== true) return { ok: false, message: "Изменение зоны ответственности отклонено проверкой System Domains." };
      queueMicrotask(() => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); });
      return { ok: true, id: policyId };
    } catch (error) {
      return { ok: false, message: error?.conflict === true ? "Данные зоны ответственности изменились в другом сеансе. Проверьте значения и повторите сохранение." : error?.message || "Сервер не принял изменение зоны ответственности." };
    }
  },
});
function getStructureMigrationDiagnosticsReactLocalQaOverrides() {
  const params = new URLSearchParams(window.location.search);
  const localQa = params.get("qa-auth-bypass") === "1" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  return { featureFlagEnabled: localQa && params.get("react-structure-migration-diagnostics") === "1", readOnlyEvaluation: localQa && params.get("react-structure-migration-diagnostics-readonly") === "1" };
}
function isStructureMigrationDiagnosticsReactEvaluationRequested() { const params = new URLSearchParams(window.location.search); if (params.get("react-structure-migration-diagnostics-evaluation") !== "1") return false; return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson()); }
function getStructureMigrationDiagnosticsReactReadState() {
  const report = productionStructureMatrixModuleState.status === "ready" ? getSystemDomainsMigrationReport() : null;
  const sourceCounts = normalizePlainRecord(report?.sourceCounts);
  const targetCounts = normalizePlainRecord(report?.targetCounts);
  const matrixReady = productionStructureMatrixModuleState.status === "ready"
    && Array.isArray(productionStructureMatrixData.PRODUCTION_STRUCTURE_MATRIX_ROWS)
    && productionStructureMatrixData.PRODUCTION_STRUCTURE_MATRIX_ROWS.length > 0
    && Array.isArray(productionStructureMatrixData.PRODUCTION_STRUCTURE_MATRIX_COLUMNS)
    && productionStructureMatrixData.PRODUCTION_STRUCTURE_MATRIX_COLUMNS.length > 0;
  const reportReady = Boolean(report)
    && Number(sourceCounts.matrixRows) === productionStructureMatrixData.PRODUCTION_STRUCTURE_MATRIX_ROWS.length
    && ["employees", "orgUnits", "positions"].every((id) => Number.isFinite(Number(targetCounts[id])));
  const serverReadFailure = productionStructureMatrixModuleState.status === "error"
    ? "model-unavailable"
    : systemDomainsServerReadState.status === "fallback"
      ? "read-unavailable"
      : systemDomainsServerReadState.status === "server" && matrixReady && !reportReady
        ? "model-unavailable"
        : "";
  return { report, serverReadFailure, serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState) && matrixReady && reportReady };
}
const structureMigrationDiagnosticsReactIslandHost = createStructureMigrationDiagnosticsReactIslandHost({
  getActivation: () => {
    const localQa = getStructureMigrationDiagnosticsReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS_READ_ONLY_EVALUATION === true;
    const runtimeActivation = resolveReactRuntimeActivation({
      surfaceId: "structureMigrationDiagnostics",
      evaluationFeatureEnabled: MES_RUNTIME_CONFIG.MES_REACT_STRUCTURE_MIGRATION_DIAGNOSTICS === true && serverEvaluationAllowed,
      evaluationRequested: isStructureMigrationDiagnosticsReactEvaluationRequested(),
      localQaEnabled: localQa.featureFlagEnabled && localQa.readOnlyEvaluation,
    });
    const readState = getStructureMigrationDiagnosticsReactReadState();
    return { ...runtimeActivation, serverReadFailure: readState.serverReadFailure, serverReadReady: readState.serverReadReady, policyId: String(MES_RUNTIME_CONFIG.MES_REACT_RUNTIME_POLICY?.policyId || "") };
  },
  getPayload: () => ({ item: systemDomainsState, migrationReport: getSystemDomainsMigrationReport(), legacyMatrixRows: productionStructureMatrixData.PRODUCTION_STRUCTURE_MATRIX_ROWS, legacyMatrixColumns: productionStructureMatrixData.PRODUCTION_STRUCTURE_MATRIX_COLUMNS }),
  getTargetRoot: () => app,
  navigateRegistry: (registryId) => {
    setProductionStructureMatrixActiveRegistry(PRODUCTION_STRUCTURE_REGISTRY_IDS.has(String(registryId || "")) ? registryId : "employees");
    if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true });
  },
  requestLegacyRender: () => { if (ui.activeModule === "productionStructureMatrix") render({ skipRememberScroll: true }); },
});

const productionStructureReactHosts = Object.freeze({ employees: structureEmployeesReactIslandHost, positions: structurePositionsReactIslandHost, orgUnits: structureOrgUnitsReactIslandHost, workCenters: structureWorkCentersReactIslandHost, equipment: structureEquipmentReactIslandHost, responsibilityPolicies: structureResponsibilityPoliciesReactIslandHost, migrationDiagnostics: structureMigrationDiagnosticsReactIslandHost });
function getActiveProductionStructureReactHost() {
  const evaluationRegistry = getReactRuntimeMode("structureMigrationDiagnostics") === "evaluation" && isStructureMigrationDiagnosticsReactEvaluationRequested() ? "migrationDiagnostics"
    : getReactRuntimeMode("structureResponsibilityPolicies") === "evaluation" && isStructureResponsibilityPoliciesReactEvaluationRequested() ? "responsibilityPolicies"
      : getReactRuntimeMode("structureEquipment") === "evaluation" && (isStructureEquipmentReactEvaluationRequested() || getStructureEquipmentReactLocalQaOverrides().writeEvaluation) ? "equipment"
        : getReactRuntimeMode("structureWorkCenters") === "evaluation" && (isStructureWorkCentersReactEvaluationRequested() || getStructureWorkCentersReactLocalQaOverrides().writeEvaluation) ? "workCenters"
          : getReactRuntimeMode("structureOrgUnits") === "evaluation" && (isStructureOrgUnitsReactEvaluationRequested() || getStructureOrgUnitsReactLocalQaOverrides().writeEvaluation) ? "orgUnits"
            : getReactRuntimeMode("structurePositions") === "evaluation" && (isStructurePositionsReactEvaluationRequested() || getStructurePositionsReactLocalQaOverrides().writeEvaluation) ? "positions"
              : getReactRuntimeMode("structureEmployees") === "evaluation" && (isStructureEmployeesReactEvaluationRequested() || getStructureEmployeesReactLocalQaOverrides().writeEvaluation || (getStructureEmployeesReactLocalQaOverrides().featureFlagEnabled && getStructureEmployeesReactLocalQaOverrides().readOnlyEvaluation)) ? "employees"
                : "";
  const structureRouteParams = new URLSearchParams(window.location.search || "");
  const registryQueryPresent = structureRouteParams.has(PRODUCTION_STRUCTURE_REGISTRY_QUERY_PARAM);
  const registryQueryValid = PRODUCTION_STRUCTURE_REGISTRY_IDS.has(String(structureRouteParams.get(PRODUCTION_STRUCTURE_REGISTRY_QUERY_PARAM) || ""));
  const registryFromUrl = getProductionStructureMatrixRegistryFromUrl();
  const requestedRegistry = registryQueryPresent ? (registryFromUrl || "orgUnits") : evaluationRegistry;
  if (requestedRegistry && (getProductionStructureMatrixActiveRegistry() !== requestedRegistry || !registryQueryValid)) setProductionStructureMatrixActiveRegistry(requestedRegistry);
  return productionStructureReactHosts[getProductionStructureMatrixActiveRegistry()] || productionStructureReactHosts.orgUnits;
}
function getWeeklyProductionControlReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-weekly-production-control") === "1",
    readOnlyEvaluation: params.get("react-weekly-production-control-readonly") === "1",
  };
}
function isWeeklyProductionControlReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-weekly-production-control-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
function getWeeklyProductionControlReactReadState() {
  const serverReadFailure = weeklyProductionControlRuntimeError
    ? "model-unavailable"
    : weeklyPlanningPeriodState.fallbackReason
      ? "compatibility-fallback"
      : weeklyPlanningPeriodState.error
        ? "read-unavailable"
        : "";
  return {
    serverReadFailure,
    serverReadReady: Boolean(weeklyProductionControlRuntimeInstance)
      && Array.isArray(weeklyPlanningPeriodState.rows)
      && !weeklyPlanningPeriodState.loading
      && !serverReadFailure,
  };
}
const weeklyProductionControlReactIslandHost = createWeeklyProductionControlReactIslandHost({
  getActivation: () => {
    const localQa = getWeeklyProductionControlReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_WEEKLY_PRODUCTION_CONTROL_READ_ONLY_EVALUATION === true;
    const runtimeActivation = resolveReactRuntimeActivation({
      surfaceId: "weeklyProductionControl",
      evaluationFeatureEnabled: MES_RUNTIME_CONFIG.MES_REACT_WEEKLY_PRODUCTION_CONTROL === true && serverEvaluationAllowed,
      evaluationRequested: isWeeklyProductionControlReactEvaluationRequested(),
      localQaEnabled: localQa.featureFlagEnabled && localQa.readOnlyEvaluation,
    });
    return {
      ...runtimeActivation,
      ...getWeeklyProductionControlReactReadState(),
      policyId: String(MES_RUNTIME_CONFIG.MES_REACT_RUNTIME_POLICY?.policyId || ""),
    };
  },
  getPayload: () => ({ model: getWeeklyProductionControlRuntimeInstance().getWeeklyProductionControlModel() }),
  getTargetRoot: () => app,
  requestLegacyRender: () => {
    if (ui.activeModule === "weeklyProductionControl") render({ skipRememberScroll: true });
  },
});
function getTimesheetReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-timesheet") === "1", readOnlyEvaluation: params.get("react-timesheet-readonly") === "1", writeEvaluation: params.get("react-timesheet-write") === "1" };
}
function isTimesheetReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-timesheet-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const timesheetReactIslandHost = createTimesheetReactIslandHost({
  getActivation: () => {
    const localQa = getTimesheetReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_TIMESHEET_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_TIMESHEET === true || localQa.featureFlagEnabled,
      serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState),
      accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isTimesheetReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor",
    };
  },
  getPayload: () => {
    const model = getTimesheetModel(); const localQa = getTimesheetReactLocalQaOverrides(); const registries = getSystemDomainsRegistries();
    const commandReady = localQa.writeEvaluation && systemDomainsServerCommandState.status === "ready" && systemDomainsServerCommandState.enabled === true && systemDomainsServerCommandState.surfaces.includes("timesheet");
    const editableEmployeeIds = commandReady ? model.employees.filter((employee) => canEditTimesheetEmployee(employee.timesheetId)).map((employee) => employee.timesheetId) : [];
    return { model, capabilities: { attendanceEdit: commandReady, scheduleEdit: commandReady, editableEmployeeIds, scheduleEditableEmployeeIds: editableEmployeeIds, scheduleTemplates: (registries.scheduleTemplates || []).map((template) => ({ id: template.id, code: template.code, caption: template.caption || template.name || "", start: template.startTime || template.start || "", end: template.endTime || template.end || "" })), attendanceEventKeys: (registries.attendanceEvents || []).map((event) => `${String(event.employeeId || "").trim()}|${String(event.date || "").trim()}`).filter((value) => !value.startsWith("|") && !value.endsWith("|")) } };
  },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, scope = "") => {
    const [action, value, dateKey] = String(scope || "").split(":");
    if (["day", "schedule"].includes(action)) openTimesheetEditor(value, dateKey);
    if (ui.activeModule === "timesheet") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getTimesheetReactLocalQaOverrides();
    if (command.type === "set-view") {
      const view = String(command.payload?.view || "").trim();
      if (!["week", "month"].includes(view)) return { ok: false, message: "Режим табеля недоступен." };
      ui.timesheetView = view;
      persistUiState();
      if (ui.activeModule === "timesheet") render({ skipRememberScroll: true });
      return { ok: true };
    }
    if (command.type === "move-period") {
      const direction = Number(command.payload?.direction);
      if (![-1, 1].includes(direction)) return { ok: false, message: "Направление периода табеля некорректно." };
      moveTimesheetPeriod(direction);
      return { ok: true };
    }
    if (!localQa.writeEvaluation || !["save-attendance", "remove-attendance", "save-schedule", "remove-schedule"].includes(command.type)) return { ok: false, message: "Команда табеля недоступна." };
    if (systemDomainsServerReadState.status !== "server" || systemDomainsServerCommandState.status !== "ready" || systemDomainsServerCommandState.enabled !== true || !systemDomainsServerCommandState.surfaces.includes("timesheet")) return { ok: false, message: "PostgreSQL-команда табеля недоступна." };
    const input = command.payload && typeof command.payload === "object" ? command.payload : {}; const employeeId = String(input.employeeId || "").trim(); const dateKey = String(input.dateKey || "").trim();
    if (!employeeId || !(getSystemDomainsRegistries().employees || []).some((employee) => employee.id === employeeId)) return { ok: false, message: "Сотрудник больше не существует." };
    if (!canEditTimesheetEmployee(employeeId)) return { ok: false, message: "Нет права изменять табель этого сотрудника." };
    try {
      if (command.type === "save-schedule") {
        const scheduleTemplateId = String(input.scheduleTemplateId || "").trim(); const effectiveFrom = String(input.effectiveFrom || "").trim(); const patternOffset = Number(input.patternOffset);
        if (!(getSystemDomainsRegistries().scheduleTemplates || []).some((template) => template.id === scheduleTemplateId)) return { ok: false, message: "Выбранный график больше не существует." };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return { ok: false, message: "Дата начала графика некорректна." };
        if (!Number.isInteger(patternOffset) || patternOffset < 0 || patternOffset > 6) return { ok: false, message: "Смещение цикла должно быть целым числом от 0 до 6." };
        const saved = await saveScheduleAssignment({ id: String(input.assignmentId || `schedule-assignment:${employeeId}`).trim(), employeeId, scheduleTemplateId, effectiveFrom, effectiveTo: null, patternOffset, sourceRefs: [`react:timesheet:schedule:${employeeId}:${effectiveFrom}`] }, { mode: "replace-effective" });
        if (saved !== true) return { ok: false, message: "Сохранение графика отклонено проверкой табеля." };
      } else if (command.type === "remove-schedule") {
        const assignmentId = String(input.assignmentId || "").trim(); const assignment = (getSystemDomainsRegistries().scheduleAssignments || []).find((row) => row.id === assignmentId && row.employeeId === employeeId);
        if (!assignment) return { ok: false, message: "Назначение графика больше не существует." };
        const removed = await removeScheduleAssignment({ employeeId, assignmentId });
        if (removed !== true) return { ok: false, message: "Сброс графика отклонён проверкой табеля." };
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { ok: false, message: "Дата факта дня некорректна." };
        if (command.type === "remove-attendance") {
          const removed = await removeAttendanceEvents({ employeeId, date: dateKey });
          if (removed !== true) return { ok: false, message: "Сброс факта дня отклонён проверкой табеля." };
        } else {
          const form = new FormData(); ["value", "start", "end", "overtime", "comment"].forEach((field) => form.set(field, String(input[field] ?? ""))); form.set("employeeId", employeeId); form.set("dateKey", dateKey);
          const change = buildTimesheetAttendanceEventsFromFormData(form);
          const reasonMessages = { unknown_attendance_value: "Выберите состояние дня.", invalid_overtime: "Сверхурочные часы должны быть неотрицательным числом.", invalid_work_window: "Для рабочего дня заполните начало и окончание.", absence_overtime_conflict: "Для отсутствия нельзя указывать сверхурочные часы.", missing_overtime_minutes: "Для сверхурочной смены укажите часы сверхурочной работы.", unsupported_attendance_value: "Выбранное состояние дня не поддерживается." };
          if (!change?.ok) return { ok: false, message: reasonMessages[change?.reason] || "Параметры факта дня некорректны." };
          const saved = await saveAttendanceEvent(change.events, { mode: "replace-day", employeeId, date: dateKey });
          if (saved !== true) return { ok: false, message: "Сохранение факта дня отклонено проверкой табеля." };
        }
      }
      queueMicrotask(() => { if (ui.activeModule === "timesheet") render({ skipRememberScroll: true }); });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.conflict === true ? "Табель изменился в другом сеансе. Проверьте значения и повторите сохранение." : error?.message || "Сервер не принял изменение табеля." };
    }
  },
});
function getPlanningWorkbenchReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-planning-workbench") === "1", readOnlyEvaluation: params.get("react-planning-workbench-readonly") === "1", writeEvaluation: params.get("react-planning-workbench-write") === "1" };
}
function isPlanningWorkbenchReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-planning-workbench-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const planningWorkbenchReactIslandHost = createPlanningWorkbenchReactIslandHost({
  getActivation: () => {
    const localQa = getPlanningWorkbenchReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_PLANNING_WORKBENCH_READ_ONLY_EVALUATION === true;
    const readStatus = workOrdersReadModel?.getStatus?.() || {};
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_PLANNING_WORKBENCH === true || localQa.featureFlagEnabled,
      serverReadReady: readStatus.bootstrapAvailable === true && !readStatus.bootstrapLoading && !readStatus.bootstrapError && Boolean(getDomainWorkOrderDetail(ui.activeRouteId)),
      accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isPlanningWorkbenchReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor",
    };
  },
  getPayload: () => { const model = getPlanningWorkbenchModel(); const localQa = getPlanningWorkbenchReactLocalQaOverrides(); return { model, capabilities: { quantityEdit: localQa.writeEvaluation && model.projectionSource === "server" && authorizeSystemDomainAction("planning", "edit") } }; },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, scope = "") => {
    const [action, ...parts] = String(scope || "").split(":");
    const value = parts.join(":");
    if (action === "route" && value) { ui.activeRouteId = value; ui.planningWorkItem = ""; persistUiState(); hydratePlanningWorkOrderReadModel(); }
    if (action === "item" && value) { ui.planningWorkItem = value; persistUiState(); }
    if (ui.activeModule === "planning") render({ skipRememberScroll: true });
  },
  navigate: async (navigation = {}) => {
    const type = String(navigation.type || ""); const id = String(navigation.id || "").trim(); const model = getPlanningWorkbenchModel();
    if (!id || !["select-route", "select-item"].includes(type)) return { ok: false, message: "Неизвестный переход Planning." };
    if (type === "select-item") {
      if (!(model.overview?.rows || []).some((row) => row.id === id)) return { ok: false, message: "Строка заказ-наряда больше не существует." };
      ui.planningWorkItem = id; persistUiState();
      if (ui.activeModule === "planning") render({ skipRememberScroll: true });
      return { ok: true, id };
    }
    if (!model.queue.some((route) => route.id === id)) return { ok: false, message: "Заказ-наряд больше не существует." };
    if (id === model.activeRouteId) return { ok: true, id };
    const previousRouteId = String(ui.activeRouteId || ""); const previousWorkItem = String(ui.planningWorkItem || "");
    ui.activeRouteId = id; ui.planningWorkItem = ""; persistUiState();
    const hydrated = await hydratePlanningWorkbenchBootstrap({ force: true, renderOnChange: false });
    if (!hydrated || ui.activeRouteId !== id || !getDomainWorkOrderDetail(id)) {
      ui.activeRouteId = previousRouteId; ui.planningWorkItem = previousWorkItem; persistUiState();
      return { ok: false, message: "Не удалось загрузить выбранный заказ-наряд." };
    }
    if (ui.activeModule === "planning") render({ skipRememberScroll: true });
    return { ok: true, id };
  },
  executeCommand: async (command = {}) => {
    const localQa = getPlanningWorkbenchReactLocalQaOverrides();
    if (!localQa.writeEvaluation || command.type !== "change-quantity") return { ok: false, message: "Изменение тиража недоступно." };
    if (!authorizeSystemDomainAction("planning", "edit")) return { ok: false, message: "Нет права изменять заказ-наряд." };
    const model = getPlanningWorkbenchModel(); const routeId = String(command.routeId || "").trim(); const quantity = Number(command.quantity);
    if (!routeId || routeId !== model.activeRouteId || !model.queue.some((route) => route.id === routeId)) return { ok: false, message: "Заказ-наряд больше не является активным." };
    if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, message: "Укажите целое количество изделий больше нуля." };
    if (model.projectionSource !== "server") return { ok: false, message: "PostgreSQL-проекция заказ-наряда недоступна." };
    const updated = await changePlanningRouteQuantity(routeId, quantity, { updateSlots: true, requireServerCommand: true, renderOnConflict: false, message: "Тираж заказ-наряда и незавершённые операции пересчитаны" });
    if (updated !== true) return { ok: false, message: "Тираж не сохранён. Данные могли измениться в другом сеансе — проверьте значения и повторите." };
    const bootstrapReady = await hydratePlanningWorkbenchBootstrap({ force: true, renderOnChange: false });
    if (!bootstrapReady || !getDomainWorkOrderDetail(routeId)) return { ok: false, message: "Тираж сохранён, но обновлённый заказ-наряд пока не загружен. Обновите экран." };
    queueMicrotask(() => { if (ui.activeModule === "planning") render({ skipRememberScroll: true }); });
    return { ok: true, id: routeId, quantity };
  },
});
async function executeShiftExecutionAssignmentCommand(command = {}, { activeModule = "shiftMasterBoard" } = {}) {
  const rowId = String(command.rowId || "").trim(); const model = getShiftMasterBoardModel();
  const row = (model.allRows || []).find((item) => item.id === rowId) || null;
  if (!row) return { ok: false, message: "Задание больше не доступно в текущем PostgreSQL-окне смены." };
  if (!getAccessRoleModulePermission(model.access?.role?.id, "shiftMasterBoard", "assign")) return { ok: false, message: "Нет права распределять задания." };
  const allowedEmployees = new Map((row.employees || []).filter((employee) => employee?.id).map((employee) => [employee.id, employee])); const seen = new Set();
  const executors = Array.isArray(command.executors) ? command.executors.map((executor) => ({ employeeId: String(executor?.employeeId || "").trim(), quantity: Number(executor?.quantity) })) : [];
  if (!executors.length) return { ok: false, message: "Назначьте количество хотя бы одному исполнителю." };
  const invalidExecutor = executors.some((executor) => {
    const employee = allowedEmployees.get(executor.employeeId);
    if (!executor.employeeId || seen.has(executor.employeeId) || !employee || employee.availability?.isAvailable !== true || !Number.isSafeInteger(executor.quantity) || executor.quantity <= 0 || executor.quantity > 9_999_999) return true;
    seen.add(executor.employeeId); return false;
  });
  if (invalidExecutor) return { ok: false, message: "Исполнители или количества не прошли проверку матрицы доступа." };
  const assignedQuantity = executors.reduce((sum, executor) => sum + executor.quantity, 0); const plannedQuantity = normalizeShiftMasterBoardQuantity(row.plannedQuantity || 0);
  if (assignedQuantity > plannedQuantity) return { ok: false, message: "Распределённое количество не может превышать план сменной задачи." };
  const saved = saveShiftMasterBoardAssignment(row.id, { masterId: row.masterProfile?.id || row.boardAssignment?.masterId || model.activeProfile?.id || "", executors, updatedAt: new Date().toISOString() }, { notifyOwner: false });
  if (!saved) return { ok: false, message: "Распределение не сохранено владельцем доски мастера." };
  const serverResult = await mirrorShiftMasterBoardAssignmentToServer(row, saved);
  if (serverResult?.ok !== true) return { ok: false, message: serverResult?.conflict ? "Распределение изменилось на сервере. Данные обновлены, повторите действие." : serverResult?.error || "PostgreSQL не подтвердил распределение." };
  queueMicrotask(() => { if (ui.activeModule === activeModule) render({ skipRememberScroll: true }); });
  return { ok: true, id: row.id };
}
async function executeShiftExecutionFactCommand(command = {}, { activeModule = "shiftMasterBoard" } = {}) {
  const rowId = String(command.rowId || "").trim();
  const model = getShiftMasterBoardModel();
  const row = (model.allRows || []).find((item) => item.id === rowId) || null;
  if (!row) return { ok: false, message: "Задание больше не доступно в текущем PostgreSQL-окне смены." };
  if (!getAccessRoleModulePermission(model.access?.role?.id, "shiftMasterBoard", "edit")) return { ok: false, message: "Нет права вносить факт смены." };
  if (!getShiftExecutionServerAssignment(row)?.id) return { ok: false, message: "Сначала выпустите сменное задание и дождитесь подтверждения PostgreSQL." };
  const values = [command.actualQuantity, command.defectQuantity, command.laborMinutes, command.executorCount].map(Number);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 9_999_999)) return { ok: false, message: "Количества факта должны быть целыми неотрицательными числами." };
  const [actualQuantity, defectQuantity, laborMinutes, executorCount] = values;
  if (defectQuantity > actualQuantity) return { ok: false, message: "Количество брака не может превышать выпуск." };
  const comment = String(command.comment || "").trim().slice(0, 500); const deviationComment = String(command.deviationComment || "").trim().slice(0, 500);
  const saved = saveShiftMasterBoardFact(row.id, { actualQuantity, defectQuantity, laborMinutes, executorCount, comment, deviationComment, updatedAt: new Date().toISOString() }, { notifyOwner: false });
  if (!saved?.fact) return { ok: false, message: "Факт не сохранён владельцем доски мастера." };
  const factResult = await mirrorShiftMasterBoardFactToServer(row, saved.fact);
  if (factResult?.ok !== true) return { ok: false, message: factResult?.error || "PostgreSQL не подтвердил факт смены." };
  if (saved.carryover && saved.carryoverChanged) {
    const carryoverResult = await mirrorShiftMasterBoardCarryoverToServer(row, saved.carryover, saved.replacedCarryover);
    if (carryoverResult?.ok !== true) return { ok: false, message: carryoverResult?.error || "Факт принят, но остаток не подтверждён PostgreSQL." };
  }
  for (const removedCarryover of saved.removedCarryovers || []) {
    const removalResult = await mirrorShiftMasterBoardCarryoverRemovalToServer(row, removedCarryover, { reason: "Задача закрыта фактом из React" });
    if (removalResult?.ok === false) return { ok: false, message: removalResult.error || "Факт принят, но прежний остаток не отменён PostgreSQL." };
  }
  queueMicrotask(() => { if (ui.activeModule === activeModule) render({ skipRememberScroll: true }); });
  return { ok: true, id: row.id };
}
function getShiftWorkOrdersReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-shift-work-orders") === "1", readOnlyEvaluation: params.get("react-shift-work-orders-readonly") === "1", writeEvaluation: params.get("react-shift-work-orders-write") === "1" };
}
function isShiftWorkOrdersReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-shift-work-orders-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const shiftWorkOrdersReactIslandHost = createShiftWorkOrdersReactIslandHost({
  getActivation: () => {
    const localQa = getShiftWorkOrdersReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_SHIFT_WORK_ORDERS_READ_ONLY_EVALUATION === true;
    const overlayClosed = !ui.shiftWorkOrderPrintPreviewId && !ui.workOrderPrintPreviewId && !normalizePlainRecord(ui.shiftWorkOrderIssuePhotoViewer).photoId;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_SHIFT_WORK_ORDERS === true || localQa.featureFlagEnabled,
      serverReadReady: systemDomainsServerReadState.status === "server" && shiftExecutionServerState.status === "ready" && shiftExecutionServerState.primaryPostgres === true && shiftExecutionServerState.schemaReady === true && shiftExecutionServerState.coverageComplete === true && overlayClosed,
      accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isShiftWorkOrdersReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor",
    };
  },
  getPayload: () => {
    const model = getShiftWorkOrderJournalViewModel(); const board = getShiftMasterBoardModel(); const localQa = getShiftWorkOrdersReactLocalQaOverrides();
    const roleCanRecordFact = getAccessRoleModulePermission(board.access?.role?.id, "shiftMasterBoard", "edit");
    const roleCanAssign = getAccessRoleModulePermission(board.access?.role?.id, "shiftMasterBoard", "assign");
    const commandsReady = localQa.writeEvaluation && shiftExecutionServerState.commandsEnabled === true;
    const factContexts = (board.allRows || []).map((row) => {
      const fact = normalizePlainRecord(row.boardFact);
      return { rowId: row.id, canEdit: commandsReady && roleCanRecordFact && Boolean(getShiftExecutionServerAssignment(row)?.id), hasFact: Boolean(fact.updatedAt), actualQuantity: Number(fact.actualQuantity || 0), laborMinutes: Number(fact.laborMinutes || 0), executorCount: Number(fact.executorCount || 0), comment: String(fact.comment || ""), deviationComment: String(fact.deviationComment || "") };
    });
    return { model, capabilities: { assignmentSave: commandsReady && roleCanAssign, factSave: commandsReady && roleCanRecordFact }, factContexts };
  },
  getTargetRoot: () => app,
  loadAssignmentContext: async (rowId = "") => {
    const journal = getShiftWorkOrderJournalViewModel(); const board = getShiftMasterBoardModel(); const id = String(rowId || "").trim();
    if (!(journal.rows || []).some((row) => row.id === id || row.sourceRowId === id)) return null;
    const row = (board.allRows || []).find((item) => item.id === id) || null;
    if (!row) return null;
    return { rowId: row.id, operationName: row.operationName, plannedQuantity: row.plannedQuantity, unit: row.unit, executors: row.boardAssignment?.executors || [], employees: row.employees || [] };
  },
  loadPrintPackage: async (rowId = "") => {
    const model = getShiftWorkOrderJournalViewModel();
    const row = (model.rows || []).find((item) => item.id === rowId || item.sourceRowId === rowId) || null;
    const routeId = row?.routeId || row?.planningOrderId || "";
    if (!row?.id || !routeId) return null;
    await ensureRoutesRenderModule();
    if (routesRenderModuleError) return null;
    return getWorkOrderPrintPackageViewModel(routeId);
  },
  printDocument: (title = "") => {
    const previousTitle = document.title;
    const restoreTitle = () => { document.title = previousTitle; window.removeEventListener("afterprint", restoreTitle); };
    document.title = String(title || "");
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.requestAnimationFrame(() => window.print());
  },
  requestLegacyRender: () => {
    if (ui.activeModule === "shiftWorkOrders") render({ skipRememberScroll: true });
  },
  navigate: async (navigation = {}) => {
    const model = getShiftWorkOrderJournalViewModel();
    const decision = resolveShiftWorkOrdersWorkshopNavigation(navigation, { rows: model.rows, canOpenWorkshop: isModuleAllowedForRole("shiftMasterBoard") });
    if (decision.ok !== true) return decision;
    const row = decision.row;
    const canonicalDateKey = normalizeDateInput(row.shiftDateKey || "");
    if (!canonicalDateKey) return { ok: false, message: "Дата исходной задачи не определена." };
    const previous = { selectedSlotId: ui.shiftMasterBoardSelectedSlotId, windowStart: ui.windowStart, activeDispatchSlotId: ui.activeDispatchSlotId, focus: ui.shiftMasterBoardFocus };
    ui.shiftWorkOrderJournalSelectedId = row.id;
    ui.shiftMasterBoardSelectedSlotId = row.sourceRowId || row.id;
    ui.windowStart = canonicalDateKey;
    ui.activeDispatchSlotId = "";
    // The journal points to an exact Workshop source. A persisted board focus
    // must not make that otherwise accessible source look stale (for example,
    // `open` legitimately hides a row that already has a fact). Keep the
    // target visible after a successful transition and restore the previous
    // focus together with the other board state when the transition fails.
    ui.shiftMasterBoardFocus = "all";
    if (!isShiftWorkOrdersWorkshopTargetSelected(decision, getShiftMasterBoardModel())) {
      ui.shiftMasterBoardSelectedSlotId = previous.selectedSlotId;
      ui.windowStart = previous.windowStart;
      ui.activeDispatchSlotId = previous.activeDispatchSlotId;
      ui.shiftMasterBoardFocus = previous.focus;
      return { ok: false, message: "Исходная задача больше не доступна в Мастерской." };
    }
    await navigateToModule("shiftMasterBoard");
    if (ui.activeModule !== "shiftMasterBoard" || !isShiftWorkOrdersWorkshopTargetSelected(decision, getShiftMasterBoardModel())) {
      ui.shiftMasterBoardSelectedSlotId = previous.selectedSlotId;
      ui.windowStart = previous.windowStart;
      ui.activeDispatchSlotId = previous.activeDispatchSlotId;
      ui.shiftMasterBoardFocus = previous.focus;
      if (ui.activeModule !== "shiftWorkOrders") await navigateToModule("shiftWorkOrders");
      return { ok: false, message: "Мастерская не смогла открыть исходную задачу." };
    }
    return { ok: true, id: ui.shiftMasterBoardSelectedSlotId, dateKey: canonicalDateKey };
  },
  executeCommand: async (command = {}) => {
    const localQa = getShiftWorkOrdersReactLocalQaOverrides();
    if (!localQa.writeEvaluation || shiftExecutionServerState.commandsEnabled !== true) return { ok: false, message: "Изменения Журнала СЗН в React недоступны." };
    if (command.type === "save-assignment") return executeShiftExecutionAssignmentCommand(command, { activeModule: "shiftWorkOrders" });
    if (command.type === "save-fact") return executeShiftExecutionFactCommand(command, { activeModule: "shiftWorkOrders" });
    return { ok: false, message: "Неизвестная команда Журнала СЗН." };
  },
});
function getShiftMasterBoardReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-shift-master-board") === "1", readOnlyEvaluation: params.get("react-shift-master-board-readonly") === "1", writeEvaluation: params.get("react-shift-master-board-write") === "1" };
}
function isShiftMasterBoardReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-shift-master-board-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const shiftMasterBoardReactIslandHost = createShiftMasterBoardReactIslandHost({
  getActivation: () => {
    const localQa = getShiftMasterBoardReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_SHIFT_MASTER_BOARD_READ_ONLY_EVALUATION === true;
    const overlayClosed = !ui.shiftMasterBoardPrintPreviewId && !ui.shiftMasterBoardPendingAction && !ui.shiftMasterBoardAssistOpen;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_SHIFT_MASTER_BOARD === true || localQa.featureFlagEnabled,
      serverReadReady: systemDomainsServerReadState.status === "server" && shiftExecutionServerState.status === "ready" && shiftExecutionServerState.primaryPostgres === true && shiftExecutionServerState.schemaReady === true && shiftExecutionServerState.coverageComplete === true && overlayClosed,
      accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isShiftMasterBoardReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor",
    };
  },
  getPayload: () => {
    const model = getShiftMasterBoardModel(); const localQa = getShiftMasterBoardReactLocalQaOverrides();
    const roleCanAssign = getAccessRoleModulePermission(model.access?.role?.id, "shiftMasterBoard", "assign");
    const roleCanRecordFact = getAccessRoleModulePermission(model.access?.role?.id, "shiftMasterBoard", "edit");
    const commandsReady = localQa.writeEvaluation && shiftExecutionServerState.commandsEnabled === true;
    return { model, capabilities: { assignmentSave: commandsReady && roleCanAssign, factSave: commandsReady && roleCanRecordFact } };
  },
  getTargetRoot: () => app,
  openCarryover: (dateKey = "", carryoverId = "") => {
    const carryover = Object.values(normalizePlainRecord(ui.shiftMasterBoardCarryovers))
      .find((item) => item?.id === carryoverId && item?.dateKey === dateKey) || null;
    if (!carryover) return;
    setShiftWorkbenchDate(dateKey, { selectedSlotId: carryover.id });
  },
  openSource: (dateKey = "", sourceRowId = "") => {
    const carryover = Object.values(normalizePlainRecord(ui.shiftMasterBoardCarryovers))
      .find((item) => item?.sourceRowId === sourceRowId && (item?.sourceDateKey === dateKey || String(sourceRowId).endsWith(`::${dateKey}`))) || null;
    if (!carryover) return;
    setShiftWorkbenchDate(dateKey, { selectedSlotId: sourceRowId });
  },
  printDocument: (rowId = "", employeeId = "", title = "") => {
    const model = getShiftMasterBoardModel();
    const row = (model.allRows || []).find((item) => item?.id === rowId) || null;
    if (!row) return;
    const executors = Array.isArray(row.boardAssignment?.executors) ? row.boardAssignment.executors : [];
    const employee = employeeId ? executors.find((item) => item?.employeeId === employeeId) || null : executors[0] || null;
    if (employeeId && !employee) return;
    markShiftMasterBoardSheetPrinted(row.id, employee?.employeeId || "");
    const previousTitle = document.title;
    const restoreTitle = () => { document.title = previousTitle; window.removeEventListener("afterprint", restoreTitle); };
    document.title = String(title || row.documentNumber || "");
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.requestAnimationFrame(() => window.print());
  },
  selectDate: (dateKey = "") => {
    setShiftWorkbenchDate(dateKey);
  },
  selectFocus: (focus = "") => {
    const nextFocus = normalizeShiftMasterBoardFocus(focus);
    if (nextFocus === ui.shiftMasterBoardFocus) return;
    ui.shiftMasterBoardFocus = nextFocus;
    queueMicrotask(() => { if (ui.activeModule === "shiftMasterBoard") render({ skipRememberScroll: true }); });
  },
  selectMaster: (masterId = "") => {
    const id = String(masterId || "").trim();
    const model = getShiftMasterBoardModel();
    if (!model.canSelectMaster || !id || !(model.profiles || []).some((profile) => profile?.id === id) || id === model.activeProfile?.id) return;
    ui.activeShiftMasterId = id;
    ui.shiftMasterBoardFocus = "mine";
    queueMicrotask(() => { if (ui.activeModule === "shiftMasterBoard") render({ skipRememberScroll: true }); });
  },
  requestLegacyRender: (_reason, scope = "") => {
    const [action, rowId] = String(scope || "").split(":");
    const model = getShiftMasterBoardModel();
    const row = (model.allRows || []).find((item) => item.id === rowId) || model.selectedRow || null;
    if (row?.id) ui.shiftMasterBoardSelectedSlotId = row.id;
    if (action === "print" && row?.id) {
      ui.shiftMasterBoardPrintPreviewId = row.id;
      ui.shiftMasterBoardPrintPreviewEmployeeId = row.boardAssignment?.executors?.[0]?.employeeId || "";
    }
    persistUiState();
    if (ui.activeModule === "shiftMasterBoard") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getShiftMasterBoardReactLocalQaOverrides();
    if (!localQa.writeEvaluation || shiftExecutionServerState.commandsEnabled !== true) return { ok: false, message: "Изменения в React недоступны." };
    const rowId = String(command.rowId || "").trim(); const model = getShiftMasterBoardModel();
    const row = (model.allRows || []).find((item) => item.id === rowId) || null;
    if (!row) return { ok: false, message: "Задание больше не доступно на доске мастера." };
    if (command.type === "save-assignment") {
      return executeShiftExecutionAssignmentCommand(command, { activeModule: "shiftMasterBoard" });
    }
    if (command.type === "save-fact") {
      return executeShiftExecutionFactCommand(command, { activeModule: "shiftMasterBoard" });
    }
    return { ok: false, message: "Неизвестная команда доски мастера." };
  },
});
function getEmployeeDesktopReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-employee-desktop") === "1", readOnlyEvaluation: params.get("react-employee-desktop-readonly") === "1", writeEvaluation: params.get("react-employee-desktop-write") === "1" };
}
function isEmployeeDesktopReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-employee-desktop-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const employeeDesktopReactIslandHost = createEmployeeDesktopReactIslandHost({
  getActivation: () => {
    const localQa = getEmployeeDesktopReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_EMPLOYEE_DESKTOP_READ_ONLY_EVALUATION === true;
    const overlayClosed = !normalizePlainRecord(ui.authSessionModal).type;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_EMPLOYEE_DESKTOP === true || localQa.featureFlagEnabled,
      serverReadReady: authModulesReady && systemDomainsServerReadState.status === "server" && shiftExecutionServerState.status === "ready" && shiftExecutionServerState.primaryPostgres === true && shiftExecutionServerState.schemaReady === true && shiftExecutionServerState.coverageComplete === true && overlayClosed,
      accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isEmployeeDesktopReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor",
    };
  },
  getPayload: () => {
    const model = getAuthSessionPrototypeModel();
    const localQa = getEmployeeDesktopReactLocalQaOverrides();
    const authPersonId = String(model.authPerson?.id || "");
    const canStartTask = localQa.writeEvaluation && (model.tasks || []).some((task) => !task.isDone && !task.isStarted && (!authPersonId || task.employeeId === authPersonId));
    const canSaveFact = localQa.writeEvaluation && (model.tasks || []).some((task) => task.isStarted && !task.isDone && (!authPersonId || task.employeeId === authPersonId));
    const canSaveReport = localQa.writeEvaluation && (model.tasks || []).some((task) => !authPersonId || task.employeeId === authPersonId);
    const reportSummaries = Object.fromEntries((model.tasks || []).map((task) => [task.id, getShiftWorkOrderIssueSummary(task.rowId)]));
    return { model, reportSummaries, capabilities: { taskStart: canStartTask, factSave: canSaveFact, reportSave: canSaveReport, sessionNavigation: model.isLoggedIn === true } };
  },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, scope = "") => {
    const [action, taskId] = String(scope || "").split(":");
    const model = getAuthSessionPrototypeModel();
    const task = (model.allTasks || []).find((item) => item.id === taskId) || model.selectedTask || null;
    if (task?.id) ui.authSessionSelectedTaskId = task.id;
    const modalType = action === "report" ? "issue" : action;
    if (["structure", "route", "pdf", "issue"].includes(modalType) && task?.id) ui.authSessionModal = { type: modalType, taskId: task.id };
    persistUiState();
    if (ui.activeModule === "authSessionPrototype") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getEmployeeDesktopReactLocalQaOverrides();
    const model = getAuthSessionPrototypeModel();
    if (command.type === "select-person") {
      if (command.personId === null) {
        cancelAuthPrototypePinFeedback();
        void deleteEmployeeServerSession().catch(() => {});
        lockAuthGate();
        ui.activeModule = "authPrototype";
        updateModuleUrlParam(ui.activeModule);
        persistUiState();
        queueMicrotask(() => render({ skipRememberScroll: true }));
        return { ok: true, id: "authPrototype" };
      }
      if (!model.canViewAll) return { ok: false, message: "Нет права просматривать рабочий стол другого сотрудника." };
      const personId = String(command.personId || "").trim();
      if (personId !== "__all" && !(model.taskPeople || []).some((person) => person.id === personId)) return { ok: false, message: "Сотрудник больше не доступен в сменном задании." };
      ui.authSessionViewedPersonId = personId;
      ui.authSessionSelectedTaskId = "";
      persistUiState();
      queueMicrotask(() => { if (ui.activeModule === "authSessionPrototype") render({ skipRememberScroll: true }); });
      return { ok: true, id: personId };
    }
    if (!localQa.writeEvaluation) return { ok: false, message: "Команды рабочего стола в React недоступны." };
    const taskId = String(command.taskId || "").trim();
    const task = (model.tasks || []).find((item) => item.id === taskId) || null;
    if (!task) return { ok: false, message: "Задание больше не доступно на рабочем столе." };
    if (model.authPerson?.id && task.employeeId !== model.authPerson.id) return { ok: false, message: "Нет права изменять задание другого сотрудника." };
    if (command.type === "start-task") {
      if (task.isDone) return { ok: false, message: "Завершённое задание нельзя взять в работу." };
      if (task.isStarted) return { ok: false, message: "Задание уже находится в работе." };
      ui.authSessionSelectedTaskId = task.id;
      const started = startAuthSessionTask(task.id, { renderOnChange: false });
      if (started !== true) return { ok: false, message: "Задание не запущено: его состояние уже изменилось." };
      queueMicrotask(() => { if (ui.activeModule === "authSessionPrototype") render({ skipRememberScroll: true }); });
      return { ok: true, id: task.id };
    }
    if (command.type === "save-fact") {
      if (task.isDone) return { ok: false, message: "Факт по этому заданию уже записан." };
      if (!task.isStarted) return { ok: false, message: "Сначала возьмите задание в работу." };
      const parseQuantity = (value) => {
        const source = String(value ?? "").trim();
        if (!/^\d{1,7}$/.test(source)) return null;
        const parsed = Number(source);
        return Number.isSafeInteger(parsed) ? parsed : null;
      };
      const actualQuantity = parseQuantity(command.actualQuantity);
      const defectQuantity = parseQuantity(command.defectQuantity);
      if (actualQuantity === null || defectQuantity === null) return { ok: false, message: "Количество должно быть целым числом от 0 до 9 999 999." };
      if (defectQuantity > actualQuantity) return { ok: false, message: "Количество брака не может превышать выполненное количество." };
      const deviationComment = String(command.deviationComment || "").trim();
      if (deviationComment.length > 500) return { ok: false, message: "Причина отклонения не должна превышать 500 символов." };
      const candidate = { actualQuantity, defectQuantity, deviationComment };
      if (doesAuthSessionFactNeedDeviationComment(task, candidate) && !deviationComment) return { ok: false, message: "Укажите причину отклонения: годное количество ниже плана больше чем на 5%." };
      ui.authSessionSelectedTaskId = task.id;
      const saved = await saveAuthSessionTaskFact(task.id, { fact: candidate, renderOnChange: false });
      if (saved !== true) return { ok: false, message: "Факт не записан: состояние задания изменилось или владелец записи недоступен." };
      queueMicrotask(() => { if (ui.activeModule === "authSessionPrototype") render({ skipRememberScroll: true }); });
      return { ok: true, id: task.id };
    }
    if (command.type === "prepare-report-photo") {
      const file = command.file;
      if (!(file instanceof File)) return { ok: false, message: "Выбранный файл недоступен." };
      if (!String(file.type || "").startsWith("image/")) return { ok: false, message: "Для Report можно прикрепить только изображение." };
      if (file.size > 20 * 1024 * 1024) return { ok: false, message: "Исходное изображение не должно превышать 20 МБ." };
      const photo = await prepareAuthSessionReportPhoto(file, command.source === "camera" ? "camera" : "file");
      if (!photo) return { ok: false, message: "Не удалось подготовить изображение." };
      return { ok: true, photo };
    }
    if (command.type === "save-report") {
      const text = String(command.text || "").trim();
      const photoSource = normalizePlainRecord(command.photo);
      const hasPhotoInput = Object.keys(photoSource).length > 0;
      const hasPhoto = Boolean(photoSource.id && photoSource.name && (photoSource.dataUrl || photoSource.storageNote));
      if (!text && !hasPhoto) return { ok: false, message: "Добавьте фото или описание проблемы." };
      if (hasPhotoInput && (!hasPhoto || !String(photoSource.type || "").startsWith("image/") || !["camera", "file"].includes(String(photoSource.source || "")))) return { ok: false, message: "Реквизиты подготовленного изображения не прошли проверку." };
      if (photoSource.dataUrl && (!String(photoSource.dataUrl).startsWith("data:image/") || String(photoSource.dataUrl).length > 320000)) return { ok: false, message: "Подготовленное изображение не прошло проверку." };
      const report = saveAuthSessionTaskReport(task.id, { text, photo: hasPhoto ? photoSource : null, renderOnChange: false });
      if (!report?.id) return { ok: false, message: "Report не сохранён: владелец журнала недоступен." };
      queueMicrotask(() => { if (ui.activeModule === "authSessionPrototype") render({ skipRememberScroll: true }); });
      return { ok: true, id: report.id };
    }
    return { ok: false, message: "Неизвестная команда рабочего стола." };
  },
});
const markingReactIslandHost = createMarkingReactIslandHost({
  getActivation: () => ({ demoEnabled: true }),
  getPayload: () => ({ mode: "mock", persistence: "memory-only", source: "phase-1-demo" }),
  getTargetRoot: () => app,
  requestLegacyRender: () => {
    if (ui.activeModule === "marking") render({ skipRememberScroll: true });
  },
});
function getAuthPickerReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1" && params.get("qa") !== "auth-functional") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-auth-picker") === "1", readOnlyEvaluation: params.get("react-auth-picker-readonly") === "1", writeEvaluation: params.get("react-auth-picker-write") === "1" };
}
function isAuthPickerReactEvaluationRequested() {
  return new URLSearchParams(window.location.search).get("react-auth-picker-evaluation") === "1";
}
const authPickerReactIslandHost = createAuthPickerReactIslandHost({
  getActivation: () => {
    const localQa = getAuthPickerReactLocalQaOverrides();
    const elevation = isNomenclatureEmployeeElevationActive();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_AUTH_PICKER_READ_ONLY_EVALUATION === true;
    const accessMode = elevation
      ? "write-evaluation"
      : localQa.writeEvaluation
      ? "write-evaluation"
      : (serverEvaluationAllowed && isAuthPickerReactEvaluationRequested()) || localQa.readOnlyEvaluation
        ? "read-only-evaluation"
        : "editor";
    // Both the System Domains API and its authority tombstone stay protected
    // before PIN. The root-only rollout verifies PostgreSQL storage before it
    // exposes this permission, then React consumes only the same allowlisted
    // pre-auth directory projection already rendered by legacy.
    const preAuthPrimaryProjectionReady = accessMode === "read-only-evaluation"
      && serverEvaluationAllowed;
    const activation = {
      featureFlagEnabled: elevation || MES_RUNTIME_CONFIG.MES_REACT_AUTH_PICKER === true || localQa.featureFlagEnabled,
      moduleReady: authModulesReady,
      systemDomainsReady: elevation || systemDomainsServerReadState.status === "server"
        || preAuthPrimaryProjectionReady,
      authGateReady: elevation || !isAuthGateUnlocked() || localQa.readOnlyEvaluation,
      pickerReady: elevation || (!ui.authPrototypePersonId && !authPrototypePinDraft && (localQa.writeEvaluation || !ui.authPrototypeResult)),
      accessMode,
    };
    if (localQa.featureFlagEnabled) window.__MES_AUTH_PICKER_ACTIVATION__ = activation;
    return activation;
  },
  getPayload: () => {
    const localQa = getAuthPickerReactLocalQaOverrides();
    const elevation = isNomenclatureEmployeeElevationActive();
    return {
      model: elevation ? getNomenclatureElevationAuthModel() : getAuthPrototypeReactModel(),
      capabilities: { pinEntry: elevation || localQa.writeEvaluation },
      authState: elevation || localQa.writeEvaluation ? { attemptsLeft: getAuthPrototypeAttemptsLeft(), result: String(ui.authPrototypeResult || "") } : {},
    };
  },
  getTargetRoot: () => app,
  executeCommand: async (command = {}) => {
    const localQa = getAuthPickerReactLocalQaOverrides();
    const elevation = isNomenclatureEmployeeElevationActive();
    if (elevation && command.type === "cancel-elevation") {
      cancelNomenclatureEmployeeElevation();
      return { ok: true, authenticated: false, message: "Подтверждение отменено." };
    }
    if ((!localQa.writeEvaluation && !elevation) || command.type !== "submit-pin") return { ok: false, message: "Ввод PIN в React недоступен." };
    if (isAuthGateUnlocked() && !elevation) return { ok: false, message: "Сессия уже авторизована." };
    const personId = String(command.personId || "").trim();
    const pin = String(command.pin || "");
    const model = elevation ? getNomenclatureElevationAuthModel() : getAuthPrototypeReactModel();
    const people = (model.departments || []).flatMap((department) => [
      ...(department.directPeople || []),
      ...(department.units || []).flatMap((unit) => unit.people || []),
    ]);
    if (!people.some((person) => person.id === personId)) return { ok: false, message: "Сотрудник больше не доступен для входа." };
    if (elevation && personId !== nomenclatureEmployeeElevationState.employeeId) return { ok: false, message: "Подтвердить изменения может только текущий сотрудник." };
    if (!/^\d{5}$/.test(pin)) return { ok: false, message: "PIN должен состоять из пяти цифр." };
    if (getAuthPrototypeAttemptsLeft() <= 0) return { ok: false, locked: true, message: "Вход заблокирован: попытки исчерпаны." };
    return scheduleAuthPrototypePinValidation(pin, personId, { renderOnChange: false });
  },
  requestLegacyRender: (_reason, scope = "") => {
    const [action, encodedPersonId, encodedDepartmentId, encodedUnitId] = String(scope || "").split(":");
    if (action === "person") {
      cancelAuthPrototypePinFeedback();
      ui.authPrototypeDepartment = decodeURIComponent(encodedDepartmentId || "");
      ui.authPrototypeUnit = decodeURIComponent(encodedUnitId || "");
      ui.authPrototypePersonId = decodeURIComponent(encodedPersonId || "");
      ui.authPrototypeResult = "";
      authPrototypePinDraft = "";
      resetAuthPrototypeAttempts();
      persistUiState();
    }
    if (ui.activeModule === "authPrototype") render({ skipRememberScroll: true });
  },
});
function getContourAdminReactLocalQaOverrides() {
  if (!isAdminRuntimeHost()) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-contour-admin") === "1", readOnlyEvaluation: params.get("react-contour-admin-readonly") === "1", writeEvaluation: params.get("react-contour-admin-write") === "1" };
}
function isContourAdminReactEvaluationRequested() {
  if (!isAdminRuntimeHost()) return false;
  return new URLSearchParams(window.location.search).get("react-contour-admin-evaluation") === "1";
}
const contourAdminReactIslandHost = createContourAdminReactIslandHost({
  getActivation: () => {
    const localQa = getContourAdminReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_CONTOUR_ADMIN_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_CONTOUR_ADMIN === true || localQa.featureFlagEnabled,
      adminHostReady: isAdminRuntimeHost() && contourAdminModuleReady,
      accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isContourAdminReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor",
    };
  },
  getPayload: () => ({ model: getContourAdminModel(), capabilities: { executeOps: getContourAdminReactLocalQaOverrides().writeEvaluation } }),
  getTargetRoot: () => app,
  executeCommand: async (command = {}) => {
    const localQa = getContourAdminReactLocalQaOverrides();
    if (!localQa.writeEvaluation || command.type !== "execute-ops") return { ok: false, message: "Защищённая Ops-команда недоступна." };
    if (command.confirmed !== true) return { ok: false, confirmationRequired: true, message: "Подтвердите защищённую операцию." };
    const actionId = String(command.actionId || "").trim();
    const scenarioId = String(command.scenarioId || "").trim();
    const scenario = getContourAdminModel().scenarios.find((item) => item.id === scenarioId);
    if (!scenario || ![scenario.actionId, scenario.precheckActionId].filter(Boolean).includes(actionId)) return { ok: false, message: "Сценарий или операция изменились." };
    const payload = await executeContourAdminAction(actionId, { confirmed: true });
    return {
      ok: payload?.ok === true,
      actionId,
      scenarioId,
      label: String(payload?.label || scenario.label || actionId),
      code: payload?.code ?? "",
      durationMs: Number(payload?.durationMs || 0),
      message: payload?.ok ? "Операция выполнена." : String(payload?.error || (payload?.code !== undefined ? `Операция завершилась с кодом ${payload.code}.` : "Операция завершилась с ошибкой.")),
    };
  },
  requestLegacyRender: () => { if (ui.activeModule === "contourAdmin") render({ skipRememberScroll: true }); },
});
function getSpecifications2ReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-specifications2") === "1",
    readOnlyEvaluation: params.get("react-specifications2-readonly") === "1",
    writeEvaluation: params.get("react-specifications2-write") === "1",
  };
}
function isSpecifications2ReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-specifications2-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const specifications2ReactIslandHost = createSpecifications2ReactIslandHost({
  getActivation: () => {
    const localQa = getSpecifications2ReactLocalQaOverrides();
    const featureFlagEnabled = MES_RUNTIME_CONFIG.MES_REACT_SPECIFICATIONS2 === true || localQa.featureFlagEnabled;
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_SPECIFICATIONS2_READ_ONLY_EVALUATION === true;
    const model = featureFlagEnabled && specifications2ModuleReady ? getSpecifications2ReactModel() : null;
    return {
      featureFlagEnabled,
      moduleReady: specifications2ModuleReady,
      serverReadReady: model?.serverStatus === "ready",
      accessMode: localQa.writeEvaluation
        ? "write-evaluation"
        : (serverEvaluationAllowed && isSpecifications2ReactEvaluationRequested()) || localQa.readOnlyEvaluation
          ? "read-only-evaluation"
          : "editor",
    };
  },
  getPayload: () => {
    const localQa = getSpecifications2ReactLocalQaOverrides();
    const model = getSpecifications2ReactModel();
    return { model, capabilities: { draftEdit: localQa.writeEvaluation, publication: localQa.writeEvaluation, workOrder: localQa.writeEvaluation && model.workOrderReady === true } };
  },
  getTargetRoot: () => app,
  executeCommand: async (command = {}) => {
    const localQa = getSpecifications2ReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !["save-draft-row", "publish-draft", "create-work-order"].includes(command.type)) {
      return { ok: false, message: "Изменение Specifications 2.0 недоступно." };
    }
    const payload = command.payload || {};
    if (command.type === "create-work-order") {
      const entryId = String(payload.entryId || "").trim();
      const revisionId = String(payload.revisionId || "").trim();
      const routeSourceDraftId = String(payload.routeSourceDraftId || "").trim();
      const quantity = Number(payload.quantity);
      const confirmRevisionId = String(payload.confirmRevisionId || "").trim();
      const model = getSpecifications2ReactModel();
      const selected = model?.selectedEntry;
      if (!selected || selected.id !== entryId || selected.serverRevision?.id !== revisionId || confirmRevisionId !== revisionId) return { ok: false, message: "Подтверждение относится к другой опубликованной ревизии." };
      if (!(selected.serverRevision.routes || []).some((route) => String(route.sourceDraftId || "") === routeSourceDraftId)) return { ok: false, message: "Маршрут больше не входит в опубликованную ревизию." };
      if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, message: "Количество должно быть целым положительным числом." };
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `specifications2-work-order:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const result = await createSpecifications2WorkOrder({ entryId, revisionId, routeSourceDraftId, quantity, idempotencyKey });
      if (!result?.ok) return { ok: false, message: result?.error || "PostgreSQL не подтвердил заказ-наряд." };
      notifySaveSuccess(result.created ? "Серверный заказ-наряд создан и передан в планирование" : "Существующий серверный заказ-наряд открыт без дублирования");
      return { ok: true, id: String(result.item?.id || result.workOrder?.id || ""), created: result.created === true };
    }
    if (command.type === "publish-draft") {
      const entryId = String(payload.entryId || "").trim();
      const confirmEntryId = String(payload.confirmEntryId || "").trim();
      const expectedPreviousRevision = Number(payload.expectedPreviousRevision);
      const model = getSpecifications2ReactModel();
      const selected = model?.selectedEntry;
      if (!entryId || confirmEntryId !== entryId) return { ok: false, message: "Подтверждение относится к другой спецификации." };
      if (!selected || selected.id !== entryId) return { ok: false, message: "Выбранная спецификация изменилась." };
      if (!Number.isInteger(expectedPreviousRevision) || expectedPreviousRevision !== Number(selected.publicationRevision || 0)) return { ok: false, message: "Ревизия черновика изменилась. Обновите экран." };
      if (selected.publicationState !== "changed") return { ok: false, message: "Для публикации нет подтверждённых изменений черновика." };
      const result = await publishSpecifications2EntryById(entryId, { notify: false, render: false });
      if (!result?.ok) return { ok: false, conflict: result?.conflict === true, message: result?.conflict ? "Спецификация изменилась в другом сеансе. Обновите данные и повторите публикацию." : result?.error || "Сервер не принял публикацию." };
      const revision = Number(result.publication?.revision || 0);
      if (!Number.isInteger(revision) || revision !== expectedPreviousRevision + 1) return { ok: false, message: "Сервер не подтвердил следующую ревизию спецификации." };
      // A successful publication invalidates the short-lived read cache. The
      // next React paint must come from the new immutable PostgreSQL revision,
      // not from the previously confirmed revision still inside its TTL.
      await refreshSpecifications2PublishedRevision(entryId, { force: true });
      const authoritative = getSpecifications2ReactModel()?.selectedEntry;
      if (!authoritative || authoritative.id !== entryId || Number(authoritative.publicationRevision || 0) !== revision || Number(authoritative.serverRevision?.revisionNo || 0) !== revision) return { ok: false, message: "PostgreSQL read-model не подтвердил опубликованную ревизию." };
      notifySaveSuccess(`Опубликована серверная ревизия ${revision}`);
      if (ui.activeModule === "specifications2") render({ skipRememberScroll: true });
      return { ok: true, id: entryId, revision };
    }
    const result = updateSpecifications2DraftRow(payload.entryId, payload.rowId, payload.value, { renderOnChange: false });
    if (!result?.ok) return result;
    notifySaveSuccess("Элемент спецификации изменён");
    if (ui.activeModule === "specifications2") render({ skipRememberScroll: true });
    return result;
  },
  requestLegacyRender: (_reason, scope = "") => {
    const [action, targetId] = String(scope || "").split(":");
    if (action === "select" && targetId) {
      try {
        const store = JSON.parse(localStorage.getItem("mes-specifications-2-registry-v1") || "{}");
        localStorage.setItem("mes-specifications-2-registry-v1", JSON.stringify({ ...store, selectedId: targetId }));
      } catch (_error) {
        // Invalid compatibility state is normalized by the legacy module.
      }
    }
    localStorage.setItem("mes-specifications-2-tab-v1", action === "routes" || action === "attachments" ? "route-drafts" : "tree");
    if (ui.activeModule === "specifications2") render({ skipRememberScroll: true });
  },
});
let ganttReactModel = null;
function getGanttReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return { featureFlagEnabled: params.get("react-gantt") === "1", readOnlyEvaluation: params.get("react-gantt-readonly") === "1", writeEvaluation: params.get("react-gantt-write") === "1" };
}
function isGanttReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-gantt-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const ganttReactIslandHost = createGanttReactIslandHost({
  getActivation: () => {
    const localQa = getGanttReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_GANTT_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_GANTT === true || localQa.featureFlagEnabled,
      runtimeReady: Boolean(ganttRuntime?.isReady?.() && ganttReactModel),
      postgresProjectionReady: planningRuntimeProjectionState.status === "server",
      accessMode: localQa.writeEvaluation ? "write-evaluation" : (serverEvaluationAllowed && isGanttReactEvaluationRequested()) || localQa.readOnlyEvaluation ? "read-only-evaluation" : "editor",
    };
  },
  getPayload: () => {
    const localQa = getGanttReactLocalQaOverrides();
    return { model: ganttReactModel, capabilities: { scheduleEdit: localQa.writeEvaluation && planningRuntimeProjectionState.status === "server" && authorizeSystemDomainAction("planning", "edit") } };
  },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, scope = "") => {
    const [action, slotId] = String(scope || "").split(":");
    if (action === "slot" && slotId) ui.selectedSlotId = slotId;
    if (ui.activeModule === "gantt") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getGanttReactLocalQaOverrides();
    if (!localQa.writeEvaluation || command.type !== "reschedule-slot") return { ok: false, message: "Изменение графика в React недоступно." };
    if (planningRuntimeProjectionState.status !== "server") return { ok: false, message: "PostgreSQL-проекция графика недоступна." };
    if (!authorizeSystemDomainAction("planning", "edit")) return { ok: false, message: "Нет права изменять производственный график." };
    const slotId = String(command.slotId || "").trim(); const routeId = String(command.routeId || "").trim(); const operationId = String(command.operationId || "").trim();
    const projectedSlot = (ganttReactModel?.rows || []).flatMap((row) => row.slots || []).find((slot) => slot.id === slotId && !slot.aggregate);
    const stateSlot = (planningState?.slots || []).find((slot) => String(slot.id || "") === slotId);
    if (!projectedSlot || !stateSlot || projectedSlot.routeId !== routeId || String(projectedSlot.operationId || "") !== operationId || String(stateSlot.routeStepId || stateSlot.operationId || "") !== operationId) return { ok: false, message: "Слот больше не соответствует выбранной операции." };
    if (stateSlot.locked || stateSlot.isLocked || isGanttSlotCompleted(stateSlot)) return { ok: false, message: "Завершённый или заблокированный слот нельзя переносить." };
    const plannedStart = new Date(String(command.plannedStart || ""));
    if (Number.isNaN(plannedStart.getTime()) || plannedStart.getFullYear() < 2000 || plannedStart.getFullYear() > 2100) return { ok: false, message: "Дата начала операции некорректна." };
    const result = await changePlanningSlotSchedule(routeId, operationId, plannedStart.toISOString(), { renderOnConflict: false });
    if (!result?.applied) return { ok: false, message: result?.kind === "conflict" ? "График изменился в другом сеансе. Экран обновлён — проверьте слот и повторите." : "Начало операции не сохранено владельцем Planning." };
    queueMicrotask(() => { if (ui.activeModule === "gantt") render({ skipRememberScroll: true }); });
    return { ok: true, id: slotId, plannedStart: result.slot?.plannedStart || plannedStart.toISOString() };
  },
});
function getRolesReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-roles") === "1",
    readOnlyEvaluation: params.get("react-roles-readonly") === "1",
    writeEvaluation: params.get("react-roles-write") === "1",
  };
}
function isRolesReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-roles-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const rolesReactIslandHost = createRolesReactIslandHost({
  getActivation: () => {
    const localQa = getRolesReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_ROLES_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: MES_RUNTIME_CONFIG.MES_REACT_ROLES === true || localQa.featureFlagEnabled,
      serverReadReady: systemDomainsServerReadState.status === "server" && Boolean(systemDomainsState),
      accessMode: localQa.writeEvaluation
        ? "write-evaluation"
        : (serverEvaluationAllowed && isRolesReactEvaluationRequested()) || localQa.readOnlyEvaluation
          ? "read-only-evaluation"
          : "editor",
    };
  },
  getPayload: () => {
    const localQa = getRolesReactLocalQaOverrides();
    const commandReady = localQa.writeEvaluation
      && systemDomainsServerCommandState.status === "ready"
      && systemDomainsServerCommandState.enabled === true
      && systemDomainsServerCommandState.surfaces.includes("access-control")
      && authorizeSystemDomainAction("roles", "configure");
    const assignmentReady = localQa.writeEvaluation
      && systemDomainsServerCommandState.status === "ready"
      && systemDomainsServerCommandState.enabled === true
      && systemDomainsServerCommandState.surfaces.includes("access-control")
      && (getSystemDomainsRegistries().employees || []).some((employee) => authorizeSystemDomainAction("roles", "assign", getAccessControlEmployeeContext(employee.id)));
    return { item: systemDomainsState, moduleDefinitions: getModuleDefinitions(), capabilities: { metadataEdit: commandReady, grantsEdit: commandReady, defaultScopeEdit: commandReady, lifecycleEdit: commandReady, assignmentEdit: assignmentReady } };
  },
  getTargetRoot: () => app,
  requestLegacyRender: () => {
    if (ui.activeModule === "roles") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getRolesReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !["save-metadata", "set-grant", "set-default-scope", "deactivate-role", "reactivate-role", "set-assignment"].includes(command.type)) return { ok: false, message: "Изменение роли недоступно." };
    if (systemDomainsServerReadState.status !== "server" || systemDomainsServerCommandState.status !== "ready" || systemDomainsServerCommandState.enabled !== true || !systemDomainsServerCommandState.surfaces.includes("access-control")) return { ok: false, message: "PostgreSQL-команда ролей недоступна." };
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "set-assignment") {
      const employeeId = String(input.employeeId || "").trim(); const confirmEmployeeId = String(input.confirmEmployeeId || "").trim(); const expectedPreviousRoleId = String(input.expectedPreviousRoleId || "").trim(); const nextRoleId = String(input.roleId || "").trim();
      const employee = (getSystemDomainsRegistries().employees || []).find((item) => String(item.id || "") === employeeId);
      if (!employee || confirmEmployeeId !== employeeId) return { ok: false, message: "Подтверждение относится к другому сотруднику." };
      if (!authorizeSystemDomainAction("roles", "assign", getAccessControlEmployeeContext(employeeId))) return { ok: false, message: "Нет права назначать роль этому сотруднику." };
      if (String(getAuthenticatedAccessPerson()?.id || "") === employeeId) return { ok: false, message: "Нельзя менять собственное явное назначение в React evaluation." };
      const assignments = (getSystemDomainsRegistries().roleAssignments || []).filter((assignment) => String(assignment.employeeId || assignment.subjectId || "") === employeeId);
      const currentRoleId = assignments.length === 1 ? String(assignments[0].roleId || "") : "";
      if (assignments.length > 1) return { ok: false, message: "У сотрудника несколько явных назначений; используйте legacy-интерфейс для разрешения конфликта." };
      if (assignments.some((assignment) => [assignment.validFrom, assignment.validTo, assignment.effectiveFrom, assignment.effectiveTo].some((value) => String(value || "").trim()))) return { ok: false, message: "Назначение имеет период действия; измените его в legacy-интерфейсе." };
      if (currentRoleId !== expectedPreviousRoleId) return { ok: false, message: "Назначение сотрудника изменилось в другом сеансе." };
      if (nextRoleId && !(getSystemDomainsRegistries().accessRoles || []).some((item) => item.id === nextRoleId && item.isActive !== false)) return { ok: false, message: "Новая роль недоступна или деактивирована." };
      if (nextRoleId === currentRoleId) return { ok: false, message: "Назначение не изменилось." };
      try {
        const updated = await setSubjectRoleAssignment({
          subjectId: employeeId,
          subjectType: "employee",
          roleId: nextRoleId,
          operation: nextRoleId ? "replace-effective" : "clear-effective",
          // The React command is immediate-only. An empty lower boundary avoids turning
          // a local calendar date into a future UTC boundary around midnight.
          effectiveAt: null,
        });
        if (updated !== true) return { ok: false, message: "Изменение назначения отклонено проверкой access-control." };
        const authoritative = (getSystemDomainsRegistries().roleAssignments || []).filter((assignment) => String(assignment.employeeId || assignment.subjectId || "") === employeeId);
        if (nextRoleId ? authoritative.length !== 1 || String(authoritative[0].roleId || "") !== nextRoleId : authoritative.length !== 0) return { ok: false, message: "Access-control не подтвердил новое назначение." };
        queueMicrotask(() => { if (ui.activeModule === "roles") render({ skipRememberScroll: true }); });
        return { ok: true, id: employeeId, roleId: nextRoleId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Назначения изменились в другом сеансе. Проверьте данные и повторите." : error?.message || "Сервер не принял назначение роли." };
      }
    }
    if (!authorizeSystemDomainAction("roles", "configure")) return { ok: false, message: "Нет права на настройку ролей." };
    const roleId = String(input.roleId || "").trim(); const label = String(input.label || "").trim(); const description = String(input.description || "").trim(); const defaultModuleId = String(input.defaultModuleId || "").trim();
    const role = (getSystemDomainsRegistries().accessRoles || []).find((item) => item.id === roleId);
    if (!role) return { ok: false, message: "Роль больше не существует." };
    if (command.type === "deactivate-role" || command.type === "reactivate-role") {
      const confirmRoleId = String(input.confirmRoleId || "").trim();
      const reactivate = command.type === "reactivate-role";
      if (confirmRoleId !== roleId) return { ok: false, message: "Подтверждение относится к другой роли." };
      if (reactivate ? role.isActive !== false : role.isActive === false) return { ok: false, message: reactivate ? "Роль уже активна." : "Роль уже деактивирована." };
      const roleAssignments = (getSystemDomainsRegistries().roleAssignments || []).filter((assignment) => String(assignment.roleId || "") === roleId);
      if (!reactivate && roleAssignments.length) return { ok: false, message: "Сначала переназначьте сотрудников: роль с назначениями нельзя деактивировать в React evaluation." };
      const currentRoleIds = getAccessControlService()?.getEffectiveSubjectRoleAssignments(getAccessControlSubject()).map((assignment) => assignment.roleId) || [];
      if (!reactivate && currentRoleIds.includes(roleId)) return { ok: false, message: "Нельзя деактивировать роль текущего пользователя." };
      try {
        const updated = await updateAccessRole({ roleId, patch: { isActive: reactivate } });
        if (updated !== true) return { ok: false, message: "Изменение статуса роли отклонено проверкой access-control." };
        const authoritativeRole = (getSystemDomainsRegistries().accessRoles || []).find((item) => item.id === roleId);
        if (!authoritativeRole || (reactivate ? authoritativeRole.isActive === false : authoritativeRole.isActive !== false)) return { ok: false, message: "Access-control не подтвердил новый статус роли." };
        queueMicrotask(() => { if (ui.activeModule === "roles") render({ skipRememberScroll: true }); });
        return { ok: true, id: roleId };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Роли изменились в другом сеансе. Проверьте данные и повторите изменение статуса." : error?.message || "Сервер не принял изменение статуса роли." };
      }
    }
    if (command.type === "set-default-scope") {
      const scope = String(input.scope || "").trim();
      if (!ACCESS_ROLE_SCOPES.some((item) => item.id === scope)) return { ok: false, message: "Область роли не поддерживается." };
      try {
        const updated = await setResponsibilityScope({ scopeId: `role-default-scope:${roleId}`, patch: { type: scope } });
        if (updated !== true) return { ok: false, message: "Изменение области роли отклонено проверкой access-control." };
        queueMicrotask(() => { if (ui.activeModule === "roles") render({ skipRememberScroll: true }); });
        return { ok: true, id: `role-default-scope:${roleId}` };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Роли изменились в другом сеансе. Проверьте данные и повторите сохранение." : error?.message || "Сервер не принял изменение области роли." };
      }
    }
    if (command.type === "set-grant") {
      const moduleId = String(input.moduleId || "").trim(); const action = String(input.action || "").trim(); const allowed = input.allowed === true;
      if (!moduleId || moduleId === "authPrototype" || !getModuleDefinitions().some((moduleItem) => moduleItem.id === moduleId)) return { ok: false, message: "Модуль grant больше не существует." };
      if (!ACCESS_ROLE_ACTIONS.some((item) => item.id === action)) return { ok: false, message: "Действие grant не поддерживается." };
      if (role.readOnly === true && !["view", "print"].includes(action)) return { ok: false, message: "Read-only роль не может получить изменяющее действие." };
      const access = getAccessControlService();
      if (!allowed && action === "view" && ACCESS_ROLE_ACTIONS.some((item) => item.id !== "view" && access?.grants(roleId, moduleId, item.id))) return { ok: false, message: "Сначала отключите зависящие от view действия." };
      try {
        const updated = await setAccessGrant({ roleId, moduleId, action, allowed });
        if (updated !== true) return { ok: false, message: "Изменение grant отклонено проверкой access-control." };
        queueMicrotask(() => { if (ui.activeModule === "roles") render({ skipRememberScroll: true }); });
        return { ok: true, id: `access-grant:${roleId}:${moduleId}:${action}` };
      } catch (error) {
        return { ok: false, message: error?.conflict === true ? "Роли изменились в другом сеансе. Проверьте данные и повторите сохранение." : error?.message || "Сервер не принял изменение grant." };
      }
    }
    if (!label) return { ok: false, message: "Заполните название роли." };
    if (defaultModuleId && !getModuleDefinitions().some((moduleItem) => moduleItem.id === defaultModuleId)) return { ok: false, message: "Стартовый модуль больше не существует." };
    if (defaultModuleId && !getAccessControlService()?.grants(roleId, defaultModuleId, "view")) return { ok: false, message: "Стартовый модуль должен быть разрешён роли на просмотр." };
    try {
      const updated = await updateAccessRole({ roleId, patch: { label, description, defaultModule: defaultModuleId } });
      if (updated !== true) return { ok: false, message: "Изменение паспорта роли отклонено проверкой access-control." };
      queueMicrotask(() => { if (ui.activeModule === "roles") render({ skipRememberScroll: true }); });
      return { ok: true, id: roleId };
    } catch (error) {
      return { ok: false, message: error?.conflict === true ? "Роли изменились в другом сеансе. Проверьте данные и повторите сохранение." : error?.message || "Сервер не принял изменение роли." };
    }
  },
});
function getDirectoryComponentTypesReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-directory-component-types") === "1",
    readOnlyEvaluation: params.get("react-directory-component-types-readonly") === "1",
    writeEvaluation: params.get("react-directory-component-types-write") === "1",
  };
}
function isDirectoryComponentTypesReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-directory-component-types-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
let directoryReactLegacyOverride = false;
const directoryComponentTypesReactIslandHost = createDirectoryComponentTypesReactIslandHost({
  getActivation: () => {
    const localQa = getDirectoryComponentTypesReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_DIRECTORY_COMPONENT_TYPES_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: !directoryReactLegacyOverride && (MES_RUNTIME_CONFIG.MES_REACT_DIRECTORY_COMPONENT_TYPES === true || localQa.featureFlagEnabled),
      activeSection: normalizeDirectorySectionId(ui.activeDirectory),
      accessMode: localQa.writeEvaluation
        ? "write-evaluation"
        : (serverEvaluationAllowed && isDirectoryComponentTypesReactEvaluationRequested()) || localQa.readOnlyEvaluation
        ? "read-only-evaluation"
        : "editor",
    };
  },
  getPayload: () => {
    const localQa = getDirectoryComponentTypesReactLocalQaOverrides();
    const canWrite = localQa.writeEvaluation && canEditDirectorySection("componentTypes");
    return { ...directoryState, capabilities: { createEdit: canWrite, delete: canWrite } };
  },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, sectionId) => {
    if (sectionId === "legacy-directory") directoryReactLegacyOverride = true;
    if (ui.activeModule === "directories") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getDirectoryComponentTypesReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !canEditDirectorySection("componentTypes")) {
      return { ok: false, message: "Запись типов компонентов недоступна для текущей роли." };
    }
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "delete") {
      const itemId = String(input.itemId || "").trim();
      const rowIndex = (directoryState.componentTypes || []).findIndex((item) => String(item.id || "") === itemId);
      if (rowIndex < 0) return { ok: false, message: "Тип компонента уже отсутствует." };
      const row = directoryState.componentTypes[rowIndex];
      const nextDirectoryState = deleteDirectoryStateRow("componentTypes", row);
      if (!nextDirectoryState) return { ok: false, message: "Не удалось удалить тип компонента." };
      const persisted = await persistDirectoryStateWithRemoval();
      if (persisted !== true) return { ok: false, message: String(persisted || "Не удалось сохранить удаление типа компонента.") };
      ui.selectedDirectoryRows.componentTypes = Math.max(0, Math.min(rowIndex, (directoryState.componentTypes || []).length - 1));
      persistUiState();
      render({ skipRememberScroll: true });
      return { ok: true, id: itemId };
    }
    if (command.type !== "save") return { ok: false, message: "Неподдерживаемая команда типов компонентов." };
    const isNew = input.isNew === true;
    const itemId = isNew ? makeId("ct") : String(input.itemId || "").trim();
    const rowIndex = isNew ? -1 : (directoryState.componentTypes || []).findIndex((item) => String(item.id || "") === itemId);
    if (!isNew && rowIndex < 0) return { ok: false, message: "Тип компонента уже отсутствует." };
    const name = String(input.name || "").trim();
    if (!name) return { ok: false, message: "Заполните поле «Тип»." };
    const row = {
      id: itemId,
      name,
      package: String(input.package || "").trim(),
      family: String(input.family || "").trim(),
      coefficient: Math.max(0, Number(input.coefficient) || 0),
      placementsPerHour: Math.max(0, Math.trunc(Number(input.placementsPerHour) || 0)),
      setupSeconds: Math.max(0, Math.trunc(Number(input.setupSeconds) || 0)),
      defaultCount: Math.max(0, Math.trunc(Number(input.defaultCount) || 0)),
      status: String(input.status || "").trim() || "Активен",
    };
    const result = saveDirectoryRow("componentTypes", rowIndex, row);
    if (result === false) return { ok: false, message: "Не удалось сохранить тип компонента." };
    ui.selectedDirectoryRows.componentTypes = rowIndex >= 0 ? rowIndex : Math.max(0, (directoryState.componentTypes || []).length - 1);
    persistUiState();
    render({ skipRememberScroll: true });
    return { ok: true, id: itemId, isNew };
  },
});
function getDirectoryOperationsReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-directory-operations") === "1",
    readOnlyEvaluation: params.get("react-directory-operations-readonly") === "1",
    writeEvaluation: params.get("react-directory-operations-write") === "1",
  };
}
function isDirectoryOperationsReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-directory-operations-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const directoryOperationsReactIslandHost = createDirectoryOperationsReactIslandHost({
  getActivation: () => {
    const localQa = getDirectoryOperationsReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_DIRECTORY_OPERATIONS_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: !directoryReactLegacyOverride && (MES_RUNTIME_CONFIG.MES_REACT_DIRECTORY_OPERATIONS === true || localQa.featureFlagEnabled),
      activeSection: normalizeDirectorySectionId(ui.activeDirectory),
      accessMode: localQa.writeEvaluation
        ? "write-evaluation"
        : (serverEvaluationAllowed && isDirectoryOperationsReactEvaluationRequested()) || localQa.readOnlyEvaluation
        ? "read-only-evaluation"
        : "editor",
    };
  },
  getPayload: () => {
    const localQa = getDirectoryOperationsReactLocalQaOverrides();
    const canWrite = localQa.writeEvaluation && canEditDirectorySection("operations");
    const operations = getOperationMapRows();
    const deleteUsageById = Object.fromEntries(operations.map((operation) => {
      const usage = getOperationDeleteUsage(operation.id);
      return [operation.id, {
        canDelete: !MES_OPERATION_MAP.some((defaultOperation) => defaultOperation.id === operation.id),
        routeStepsCount: usage.routeStepsCount,
        slotsCount: usage.slotsCount,
        specificationRowsCount: usage.specificationRowsCount,
      }];
    }));
    return {
      operations: operations.map((operation) => ({
        ...operation,
        workCenterLabel: appEventsService.formatDirectoryCell("operations", "workCenterId", operation.workCenterId),
      })),
      workCenters: getRouteInstructionWorkCenters().map((center) => ({
        id: center.id,
        label: center.name,
        code: center.code || "",
      })),
      deleteUsageById,
      capabilities: { createEdit: canWrite, delete: canWrite },
    };
  },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, sectionId) => {
    if (sectionId === "legacy-directory") directoryReactLegacyOverride = true;
    if (ui.activeModule === "directories") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getDirectoryOperationsReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !canEditDirectorySection("operations")) {
      return { ok: false, message: "Запись операций недоступна для текущей роли." };
    }
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "delete") {
      const itemId = String(input.itemId || "").trim();
      const rowIndex = getOperationMapRows().findIndex((item) => String(item.id || "") === itemId);
      if (rowIndex < 0) return { ok: false, message: "Операция уже отсутствует." };
      if (MES_OPERATION_MAP.some((operation) => operation.id === itemId)) return { ok: false, message: "Встроенную операцию MES удалить нельзя." };
      const nextCount = Math.max(0, getOperationMapRows().length - 1);
      ui.selectedDirectoryRows.operations = nextCount ? Math.min(rowIndex, nextCount - 1) : 0;
      if (deleteOperationMapItem(itemId, { deferDirectoryPersist: true }) !== true) return { ok: false, message: "Не удалось удалить операцию." };
      const persisted = await persistDirectoryStateWithRemoval();
      if (persisted !== true) return { ok: false, message: String(persisted || "Не удалось сохранить удаление операции.") };
      return { ok: true, id: itemId };
    }
    if (command.type !== "save") return { ok: false, message: "Неподдерживаемая команда операций." };
    const isNew = input.isNew === true;
    const itemId = isNew ? makeId("op") : String(input.itemId || "").trim();
    const rowIndex = isNew ? -1 : getOperationMapRows().findIndex((item) => String(item.id || "") === itemId);
    if (!isNew && rowIndex < 0) return { ok: false, message: "Операция уже отсутствует." };
    const name = String(input.name || "").trim();
    if (!name) return { ok: false, message: "Заполните поле «Операция»." };
    const workCenterId = getRouteInstructionWorkCenterId(String(input.workCenterId || "").trim());
    if (!workCenterId || !getRouteInstructionWorkCenters().some((center) => center.id === workCenterId)) {
      return { ok: false, message: "Выберите рабочий центр." };
    }
    const previous = rowIndex >= 0 ? getOperationMapRows()[rowIndex] : {};
    const row = {
      ...previous,
      id: itemId,
      name,
      workCenterId,
      status: String(input.status || "").trim() || "Активен",
    };
    const result = saveDirectoryRow("operations", rowIndex, row);
    if (result === false) return { ok: false, message: "Не удалось сохранить операцию." };
    ui.selectedDirectoryRows.operations = rowIndex >= 0 ? rowIndex : Math.max(0, getOperationMapRows().length - 1);
    persistUiState();
    render({ skipRememberScroll: true });
    return { ok: true, id: itemId, isNew };
  },
});
function getDirectoryNomenclatureTypesReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-directory-nomenclature-types") === "1",
    readOnlyEvaluation: params.get("react-directory-nomenclature-types-readonly") === "1",
    writeEvaluation: params.get("react-directory-nomenclature-types-write") === "1",
  };
}
function isDirectoryNomenclatureTypesReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-directory-nomenclature-types-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const directoryNomenclatureTypesReactIslandHost = createDirectoryNomenclatureTypesReactIslandHost({
  getActivation: () => {
    const localQa = getDirectoryNomenclatureTypesReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: !directoryReactLegacyOverride && (MES_RUNTIME_CONFIG.MES_REACT_DIRECTORY_NOMENCLATURE_TYPES === true || localQa.featureFlagEnabled),
      activeSection: normalizeDirectorySectionId(ui.activeDirectory),
      accessMode: localQa.writeEvaluation
        ? "write-evaluation"
        : (serverEvaluationAllowed && isDirectoryNomenclatureTypesReactEvaluationRequested()) || localQa.readOnlyEvaluation
        ? "read-only-evaluation"
        : "editor",
    };
  },
  getPayload: () => {
    const localQa = getDirectoryNomenclatureTypesReactLocalQaOverrides();
    const deleteUsageById = Object.fromEntries((directoryState.nomenclatureTypes || []).flatMap((row) => {
      const itemId = String(row?.id || "").trim();
      if (!itemId) return [];
      const typeKey = normalizeLookupText(normalizeNomenclatureType(row.name));
      const nomenclatureCount = (directoryState.nomenclature || []).filter((item) => normalizeLookupText(normalizeNomenclatureType(item.type)) === typeKey).length;
      const specificationRowsCount = (directoryState.specifications || []).reduce((count, specification) => count + getSpecificationStructureItems(specification).filter((item) => normalizeLookupText(normalizeNomenclatureType(item.nomenclatureType)) === typeKey).length, 0);
      return [[itemId, { nomenclatureCount, specificationRowsCount, fallbackType: getFallbackNomenclatureType(row.name) }]];
    }));
    const canWrite = localQa.writeEvaluation && canEditDirectorySection("nomenclatureTypes");
    return {
      ...directoryState,
      deleteUsageById,
      capabilities: { createEdit: canWrite, delete: canWrite },
    };
  },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, sectionId) => {
    if (sectionId === "legacy-directory") directoryReactLegacyOverride = true;
    if (ui.activeModule === "directories") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getDirectoryNomenclatureTypesReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !canEditDirectorySection("nomenclatureTypes")) {
      return { ok: false, message: "Запись типов номенклатуры недоступна для текущей роли." };
    }
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "delete") {
      const itemId = String(input.itemId || "").trim();
      const rowIndex = (directoryState.nomenclatureTypes || []).findIndex((item) => String(item.id || "") === itemId);
      if (rowIndex < 0) return { ok: false, message: "Тип номенклатуры уже отсутствует." };
      const nextDirectoryState = deleteDirectoryStateRow("nomenclatureTypes", directoryState.nomenclatureTypes[rowIndex]);
      if (!nextDirectoryState) return { ok: false, message: "Не удалось удалить тип номенклатуры." };
      const persisted = await persistDirectoryStateWithRemoval();
      if (persisted !== true) return { ok: false, message: String(persisted || "Не удалось сохранить удаление типа номенклатуры.") };
      ui.selectedDirectoryRows.nomenclatureTypes = Math.max(0, Math.min(rowIndex, (directoryState.nomenclatureTypes || []).length - 1));
      persistUiState();
      render({ skipRememberScroll: true });
      return { ok: true, id: itemId };
    }
    if (command.type !== "save") return { ok: false, message: "Неподдерживаемая команда типов номенклатуры." };
    const isNew = input.isNew === true;
    const itemId = isNew ? makeId("nt") : String(input.itemId || "").trim();
    const rowIndex = isNew ? -1 : (directoryState.nomenclatureTypes || []).findIndex((item) => String(item.id || "") === itemId);
    if (!isNew && rowIndex < 0) return { ok: false, message: "Тип номенклатуры уже отсутствует." };
    const name = String(input.name || "").trim();
    if (!name) return { ok: false, message: "Заполните поле «Тип номенклатуры»." };
    const previous = rowIndex >= 0 ? directoryState.nomenclatureTypes[rowIndex] : {};
    const row = {
      ...previous,
      id: itemId,
      name,
      code: String(input.code || "").trim(),
      description: String(input.description || "").trim(),
      status: String(input.status || "").trim() || "Активен",
    };
    const result = saveDirectoryRow("nomenclatureTypes", rowIndex, row);
    if (result === false) return { ok: false, message: "Не удалось сохранить тип номенклатуры." };
    ui.selectedDirectoryRows.nomenclatureTypes = rowIndex >= 0 ? rowIndex : Math.max(0, (directoryState.nomenclatureTypes || []).length - 1);
    persistUiState();
    render({ skipRememberScroll: true });
    return { ok: true, id: itemId, isNew };
  },
});
function getDirectoryStatusesReactLocalQaOverrides() {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(window.location.hostname)) return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  const params = new URLSearchParams(window.location.search);
  if (params.get("qa-auth-bypass") !== "1") return { featureFlagEnabled: false, readOnlyEvaluation: false, writeEvaluation: false };
  return {
    featureFlagEnabled: params.get("react-directory-statuses") === "1",
    readOnlyEvaluation: params.get("react-directory-statuses-readonly") === "1",
    writeEvaluation: params.get("react-directory-statuses-write") === "1",
  };
}
function isDirectoryStatusesReactEvaluationRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("react-directory-statuses-evaluation") !== "1") return false;
  return params.get("qa-auth-bypass") === "1" || Boolean(getAuthenticatedAccessPerson());
}
const directoryStatusesReactIslandHost = createDirectoryStatusesReactIslandHost({
  getActivation: () => {
    const localQa = getDirectoryStatusesReactLocalQaOverrides();
    const serverEvaluationAllowed = MES_RUNTIME_CONFIG.MES_REACT_DIRECTORY_STATUSES_READ_ONLY_EVALUATION === true;
    return {
      featureFlagEnabled: !directoryReactLegacyOverride && (MES_RUNTIME_CONFIG.MES_REACT_DIRECTORY_STATUSES === true || localQa.featureFlagEnabled),
      activeSection: normalizeDirectorySectionId(ui.activeDirectory),
      accessMode: localQa.writeEvaluation
        ? "write-evaluation"
        : (serverEvaluationAllowed && isDirectoryStatusesReactEvaluationRequested()) || localQa.readOnlyEvaluation
        ? "read-only-evaluation"
        : "editor",
    };
  },
  getPayload: () => {
    const localQa = getDirectoryStatusesReactLocalQaOverrides();
    return {
      statuses: getDirectoryData("statuses").rows,
      capabilities: {
        createEditCustom: localQa.writeEvaluation && canEditCustomStatusDirectorySection(),
        deleteCustom: localQa.writeEvaluation && canEditCustomStatusDirectorySection(),
      },
    };
  },
  getTargetRoot: () => app,
  requestLegacyRender: (_reason, sectionId) => {
    if (sectionId === "legacy-directory") directoryReactLegacyOverride = true;
    if (ui.activeModule === "directories") render({ skipRememberScroll: true });
  },
  executeCommand: async (command = {}) => {
    const localQa = getDirectoryStatusesReactLocalQaOverrides();
    if (!localQa.writeEvaluation || !canEditCustomStatusDirectorySection()) {
      return { ok: false, message: "Создание пользовательских статусов недоступно для текущей роли." };
    }
    const input = command.payload && typeof command.payload === "object" ? command.payload : {};
    if (command.type === "delete-custom") {
      const itemId = String(input.itemId || "").trim();
      const rows = directoryState.statuses || [];
      const rowIndex = rows.findIndex((item) => String(item?.id || "") === itemId);
      if (rowIndex < 0) return { ok: false, message: "Пользовательский статус уже отсутствует." };
      if (!isUserManagedDirectoryStatus(rows[rowIndex])) return { ok: false, message: "Системные статусы удалить нельзя." };
      const nextCount = Math.max(0, rows.length - 1);
      ui.selectedDirectoryRows.statuses = nextCount ? Math.min(rowIndex, nextCount - 1) : 0;
      if (await deleteUserManagedDirectoryStatus(itemId, { deferDirectoryPersist: true }) !== true) {
        return { ok: false, message: "Не удалось удалить пользовательский статус." };
      }
      const persisted = await persistDirectoryStateWithRemoval();
      if (persisted !== true) return { ok: false, message: String(persisted || "Не удалось сохранить удаление пользовательского статуса.") };
      return { ok: true, id: itemId };
    }
    if (command.type !== "save-custom") return { ok: false, message: "Неподдерживаемая команда реестра статусов." };
    const isNew = input.isNew === true;
    const itemId = isNew ? makeId("custom-status") : String(input.itemId || "").trim();
    const rows = directoryState.statuses || [];
    const rowIndex = isNew ? -1 : rows.findIndex((item) => String(item.id || "") === itemId);
    if (!isNew && (rowIndex < 0 || !isUserManagedDirectoryStatus(rows[rowIndex]))) {
      return { ok: false, message: "Системные статусы нельзя изменять из пользовательского редактора." };
    }
    const name = String(input.name || "").trim();
    const code = String(input.code || "").trim();
    const group = String(input.group || "").trim();
    if (!name || !code || !group) return { ok: false, message: "Заполните область, название и код статуса." };
    const duplicate = rows.some((item, index) => index !== rowIndex
      && normalizeLookupText(item.code) === normalizeLookupText(code)
      && normalizeLookupText(item.group) === normalizeLookupText(group));
    if (duplicate) return { ok: false, message: "В этой области уже существует статус с таким кодом." };
    const previous = rowIndex >= 0 ? rows[rowIndex] : {};
    const row = {
      ...previous,
      id: itemId,
      statusAuthority: "user",
      registryKind: "status",
      group,
      name,
      code,
      type: String(input.type || "Пользовательский статус").trim() || "Пользовательский статус",
      annotation: String(input.annotation || "").trim(),
      impact: String(input.impact || "").trim(),
    };
    const result = saveDirectoryRow("statuses", rowIndex, row, { customStatusWrite: true });
    if (result === false) return { ok: false, message: "Не удалось сохранить пользовательский статус." };
    ui.selectedDirectoryRows.statuses = rowIndex >= 0 ? rowIndex : Math.max(0, (directoryState.statuses || []).length - 1);
    persistUiState();
    render({ skipRememberScroll: true });
    return { ok: true, id: itemId, isNew };
  },
});
function ensureNomenclatureRenderModule() {
  if (renderNomenclatureModulePage) return Promise.resolve(true);
  if (nomenclatureRenderModuleLoad) return nomenclatureRenderModuleLoad;
  nomenclatureRenderModuleLoad = import("./modules/nomenclature/render.js")
    .then(({ renderNomenclatureModulePage: renderer }) => {
      renderNomenclatureModulePage = renderer;
      if (ui.activeModule === "nomenclature") render();
      return true;
    })
    .catch((error) => {
      console.error("Не удалось загрузить модуль номенклатуры", error);
      nomenclatureRenderModuleLoad = null;
      return false;
    });
  return nomenclatureRenderModuleLoad;
}
function initializeProductsRenderModule() {
  ({
    addNomenclatureToBom,
    applyGanttRowToSlot,
    cancelAuthPrototypePinFeedback,
    completeAuthPrototypeLogin,
    createSpekiSpecification,
    deleteBomImportRow,
    ensureNomenclatureTypeExists,
    ensureRouteModuleProjectForSpecification,
    findSmtLineByNumber,
    getActiveSpecificationForModule,
    getAuthPrototypeAttemptsLeft,
    getAuthPrototypeDepartmentRows,
    getAuthPrototypeDirectDepartmentPeople,
    getAuthPrototypePeople,
    getAuthPrototypePeopleByUnit,
    getAuthPrototypePinFeedbackTone,
    getAuthPrototypePinPerson,
    getAuthPrototypeSelectedDepartment,
    getAuthPrototypeSelectedPerson,
    getAuthPrototypeSelectedUnit,
    getAuthPrototypeUnitRows,
    getBomImportRowNomenclatureItem,
    getBomImportRows,
    getBomLinkedSpecifications,
    getBomList,
    getBomResultNomenclatureItem,
    getDefaultSmtLineConfigurations,
    getDirectoryRows,
    getFallbackNomenclatureType,
    getGanttResourceForSlot,
    getNomenclatureDeleteUsage,
    getNomenclatureItem,
    getResourceBaseCph,
    getResourceRowId,
    getResourcesForWorkCenter,
    getRouteBindingContext,
    getRouteBindingModeForSelection,
    getRouteBindingOptions,
    getRouteBomList,
    getRouteDocumentKind,
    getRouteDocumentKindLabel,
    getRouteDocumentKindShortLabel,
    getRouteLineageSubjectName,
    getRouteModuleSelectionName,
    getRouteModuleSelectionValue,
    getRouteParentRoute,
    getRouteRootRoute,
    getRouteScopeRootTask,
    getRouteSpecification,
    getRoutesForModule,
    getSlotGanttResourceId,
    getSlotGanttWorkCenterId,
    getSmtLineConfigurations,
    getSmtLineIdFromWorkCenterId,
    getSmtLineNumberFromText,
    getSpecificationBomEntries,
    getSpecificationById,
    getSpecificationDeleteUsage,
    getSpecificationItemBomId,
    getSpecificationProductionOrder,
    getSpekiStructureItemDisplayName,
    getSpekiStructureItemLabel,
    getSpekiStructureSectionOptions,
    getSpekiStructureTableRows,
    inferAccessRoleIdForPerson,
    importBomFromXlsxFile,
    isAuthPrototypePinFeedbackLocked,
    isSmtLineWorkCenterId,
    migrateSpecificationBomRowsToNomenclature,
    normalizeBomImportRow,
    normalizeLookupText,
    normalizeNomenclatureType,
    normalizeRouteBindingValue,
    normalizeSmtComponentKeyPart,
    renderModulePreviewEmpty,
    renderNomenclaturePage,
    resetAuthPrototypeAttempts,
    resolveRouteModuleProjectId,
    scheduleAuthPrototypePinValidation,
    scopeRouteTasks,
    summarizeBomComponentFields,
    syncNomenclatureTypeRename,
    syncNomenclatureTypesFromItems,
    syncSpecificationDerivedFields,
    updateBomImportCell,
    upsertBomResultToNomenclature,
  } = createProductsRenderModule({
  AUTH_GATE_MAX_ATTEMPTS,
  AUTH_GATE_PIN,
  BOARD_BOM_TERM,
  BOARD_SPEC_LIST_TERM,
  BOARD_SPEC_TERM,
  BOM_COMPONENT_FIELDS,
  BOM_IMPORT_COLUMN_COUNT,
  BOM_IMPORT_FALLBACK_HEADERS,
  DEFAULT_COMPONENT_TYPES,
  DEFAULT_INTERFACE_ROLE_ID,
  DEFAULT_NOMENCLATURE_TYPES,
  DEFAULT_RESOURCE_CPH,
  MES_SMT_WORK_CENTER_IDS,
  NOMENCLATURE_DEFAULT_TYPES,
  NOMENCLATURE_REA_COMPONENT_TYPE,
  PRODUCT_COMPOSITION_LIST_TERM,
  PRODUCT_COMPOSITION_TERM,
  PRODUCT_STRUCTURE_TERM,
  ROUTE_DOCUMENT_KIND_LABELS,
  ROUTE_DOCUMENT_KIND_ORDER,
  ROUTE_DOCUMENT_KIND_SHORT_LABELS,
  SMT_LINE_WORKCENTER_PREFIX,
  addMs,
  authPrototypePinFeedbackSequence,
  authPrototypePinFeedbackTimer,
  createEmployeeSession: (...args) => createEmployeeServerSession(...args),
  getAuthPrototypePinFeedbackSequence: () => authPrototypePinFeedbackSequence,
  getAuthPrototypePinFeedbackTimer: () => authPrototypePinFeedbackTimer,
  setAuthPrototypePinFeedbackSequence: (nextValue) => { authPrototypePinFeedbackSequence = nextValue; },
  setAuthPrototypePinFeedbackTimer: (nextValue) => { authPrototypePinFeedbackTimer = nextValue; },
  bindSpekiEvents,
  dedupeProductionResources,
  escapeAttribute,
  escapeHtml,
  formatReportNumber,
  finishEmployeeAuthElevation: (actor) => finishNomenclatureEmployeeElevation(actor),
  getAccessRoleById: (...args) => getAccessRoleById(...args),
  getAuthPrototypeSelectedExecutor: (...args) => getAuthPrototypeSelectedExecutor(...args),
  getComponentTypes,
  getDefaultOperationCalculationType,
  getFulfillmentLabel,
  getOperationMapItem,
  getPlanningResourceForRouteStep,
  getProductionContextForSpecification,
  getProductionResource,
  getProductionResourceWorkCenterId,
  getProductionResourcesForWorkCenter,
  getProductionStructureEmployees,
  getProductionStructureMatrixRuntimeOverrides,
  getProductionStructureWorkCenters,
  getProject,
  getProjectDisplayName,
  getRouteForStep,
  getRouteProductionContext,
  getRouteStepEffectiveOperationContext,
  getRouteStepPlanningAssignmentForSlot,
  getRouteStepSelectedPlanningWorkCenterId,
  getRouteUnscopedBaseTasks,
  getSpecificationByProjectId,
  getSpecificationItemBoardsPerPanel,
  getSpecificationItemFulfillmentMode,
  getSpecificationStructureItems,
  getWorkCenter,
  icon,
  inferStructureNomenclatureType,
  isEmployeeAuthRequired: () => isEmployeeServerAuthRequired(),
  isEmployeeAuthElevationActive: () => isNomenclatureEmployeeElevationActive(),
  isLegacyDirectoryWriteBlocked,
  makeFallbackProductionResource,
  makeId,
  mapLegacyWorkCenterId,
  normalizeAccessRoleAssignments,
  normalizeDirectoryRow,
  normalizeDirectoryState,
  normalizeOptionalPositiveInteger,
  normalizePlanningState,
  normalizeSpecificationStructureItem,
  notifySaveSuccess,
  persistDirectoryState,
  persistState,
  persistUiState,
  render,
  renderDenseInlineSelect,
  renderNomenclatureModulePage: (moduleDeps) => {
    if (!renderNomenclatureModulePage) {
      void ensureNomenclatureRenderModule();
      return renderMesModulePatternPage({
        moduleId: "nomenclature",
        sidebar: {
          eyebrow: "Материалы и компоненты",
          title: "Номенклатура",
          variant: "filters",
          body: "",
        },
        header: {
          eyebrow: "Список компонентов",
          title: "Загружаем номенклатуру",
          description: "Модуль откроется автоматически.",
        },
        content: renderUiEmptyState({ title: "Загружаем номенклатуру", description: "Модуль откроется автоматически." }),
      });
    }
    return renderNomenclatureModulePage({
      ...moduleDeps,
      renderMesModulePatternPage,
      renderUiFormActions,
      renderUiFormGrid,
    });
  },
  renderUiSidebarItem,
  renderUiActionButton,
  renderUiActionFileLabel,
  renderUiEmptyState,
  renderUiFilterBar,
  renderUiFormActions,
  renderUiFormField,
  renderUiFormGrid,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiModuleSidebar,
  renderUiPanel,
  renderUiPanelBody,
  renderUiStatusToken,
  renderUiTableWrap,
  resetAuthPrototypeKeypad: () => { authPrototypeKeypadDigits = []; },
  resolveProductionResourceType,
  resourceParticipatesInCalculation,
  resourceParticipatesInPlanning,
  selected,
  toDateInput,
  unlockAuthGate,
  updateModuleUrlParam,
  getDirectoryState: () => directoryState,
  getPlanningState: () => planningState,
  setPlanningState: setPlanningStateAndInvalidate,
  getUi: () => ui,
  }));
}

function dedupeEmployeeOrgRows(rows = []) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const key = String(row?.id || row?.personId || row?.name || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getEmployeeDepartmentLabelForWorkCenters(workCenterIds = []) {
  const ids = Array.isArray(workCenterIds) ? workCenterIds : [workCenterIds];
  const labels = ids
    .map((id) => getWorkCenter(mapLegacyWorkCenterId(id))?.name || "")
    .filter(Boolean);
  return labels[0] || "Участок не задан";
}

let doesAuthSessionFactNeedDeviationComment = () => false;
let getAuthPrototypeSelectedExecutor = () => null;
let getAuthPrototypeReactModel = () => ({ departments: [] });
let getAuthSessionFactDeviationPercent = () => 0;
let getAuthSessionFactDraft = () => ({ actualQuantity: 0, defectQuantity: 0 });
let getAuthSessionPrototypeModel = () => ({ allTasks: [], selectedTask: null });
let getAuthSessionTaskRowId = (value = "") => String(value || "");
let getAuthSessionTaskGoodQuantity = () => 0;
let getShiftWorkOrderIssueLookupKeys = () => [];
let getShiftWorkOrderIssueReports = () => [];
let getShiftWorkOrderIssueSummary = () => ({ total: 0 });
let getShiftWorkOrderReportPhotoItems = () => [];
let normalizeAuthSessionFactField = (field = "") => field === "defect" ? "defect" : "actual";
let normalizeShiftWorkOrderIssueReports = (value = {}) => normalizePlainRecord(value);
let renderAuthPrototypePage = () => renderUiModulePage({ ariaLabel: "Вход", className: "auth-prototype-page", content: renderUiEmptyState({ title: "Загружаем вход", description: "Экран откроется автоматически." }) });
let renderAuthSessionModal = () => "";
let renderAuthSessionPrototypePage = () => renderUiModulePage({ ariaLabel: "Рабочая сессия", className: "auth-session-page", content: renderUiEmptyState({ title: "Загружаем рабочую сессию", description: "Экран откроется автоматически." }) });
let prepareAuthSessionReportPhoto = async () => null;
let saveAuthSessionTaskReport = () => false;
let setAuthSessionFactDraft = () => {};
let setAuthSessionReportDraft = () => {};
let bindAuthPrototypeEvents = () => {};
let bindAuthSessionEvents = () => {};
let startAuthSessionTask = () => false;
let saveAuthSessionTaskFact = async () => false;
let authRenderModuleLoad = null;
let authEventsModuleLoad = null;
let authModulesReady = false;
function initializeAuthRenderModule(factory) {
  ({
    doesAuthSessionFactNeedDeviationComment,
    getAuthPrototypeSelectedExecutor,
    getAuthPrototypeReactModel,
    getAuthSessionFactDeviationPercent,
    getAuthSessionFactDraft,
    getAuthSessionPrototypeModel,
    getAuthSessionTaskRowId,
    getAuthSessionTaskGoodQuantity,
    getShiftWorkOrderIssueLookupKeys,
    getShiftWorkOrderIssueReports,
    getShiftWorkOrderIssueSummary,
    getShiftWorkOrderReportPhotoItems,
    normalizeAuthSessionFactField,
    normalizeShiftWorkOrderIssueReports,
    renderAuthPrototypePage,
    renderAuthSessionModal,
    renderAuthSessionPrototypePage,
    prepareAuthSessionReportPhoto,
    saveAuthSessionTaskReport,
    setAuthSessionFactDraft,
    setAuthSessionReportDraft,
  } = factory({
  AUTH_PIN_TEMPORARILY_DISABLED,
  AUTH_DEPARTMENT_ICON_BY_ID,
  AUTH_UNIT_ICON_BY_ID,
  escapeAttribute,
  escapeHtml,
  formatReportNumber,
  formatWeeklyProductionControlPercent: (...args) => moduleRuntime
    ? moduleRuntime.getPublicPort("weeklyProductionControl", "formatWeeklyProductionControlPercent")(...args)
    : `${Math.round(Number(args[0] || 0))}%`,
  getActiveInterfaceRole,
  getAccessRoleById,
  getAccessRoleForEmployee: (...args) => getAccessRoleForEmployee(...args),
  getAuthPrototypeAttemptsLeft,
  getAuthenticatedAccessPerson: (...args) => getAuthenticatedAccessPerson(...args),
  getAuthPrototypeDepartmentRows,
  getAuthPrototypeDirectDepartmentPeople,
  getAuthPrototypePeople,
  getAuthPrototypePeopleByUnit,
  getAuthPrototypePinDraft: () => authPrototypePinDraft,
  getAuthPrototypeKeypadDigitsState: () => authPrototypeKeypadDigits,
  getAuthPrototypePinFeedbackTone,
  getAuthPrototypeSelectedDepartment,
  getAuthPrototypeSelectedPerson,
  getAuthPrototypeSelectedUnit,
  getAuthPrototypeUnitRows,
  getMesCustomIconNameForRuntimeId,
  getModuleDefinitions: (...args) => getModuleDefinitions(...args),
  getPlanningOrderObjectLabel,
  getPlanningState: () => planningState,
  getProductionStructureEmployees,
  getProductionStructureMatrixRuntimeOverrides,
  getShiftMasterBoardAssignment: (...args) => typeof getShiftMasterBoardAssignment === "function" ? getShiftMasterBoardAssignment(...args) : {},
  getShiftMasterBoardLaborMinutesPerUnit: (...args) => typeof getShiftMasterBoardLaborMinutesPerUnit === "function" ? getShiftMasterBoardLaborMinutesPerUnit(...args) : 0,
  getShiftMasterBoardModel: (...args) => typeof getShiftMasterBoardModel === "function" ? getShiftMasterBoardModel(...args) : ({ rows: [], allRows: [] }),
  getShiftMasterBoardRouteChain: (...args) => typeof getShiftMasterBoardRouteChain === "function" ? getShiftMasterBoardRouteChain(...args) : ({ previous: null, current: null, next: null }),
  getShiftMasterEmployee,
  getShiftMasterRowOrderLabel: (...args) => typeof getShiftMasterRowOrderLabel === "function" ? getShiftMasterRowOrderLabel(...args) : "Заказ-наряд",
  getShiftMasterRowRoutePartLabel: (...args) => typeof getShiftMasterRowRoutePartLabel === "function" ? getShiftMasterRowRoutePartLabel(...args) : "Маршрут",
  getWorkCenter,
  getUi: () => ui,
  icon,
  inferAccessRoleIdForPerson: (...args) => typeof inferAccessRoleIdForPerson === "function" ? inferAccessRoleIdForPerson(...args) : getActiveInterfaceRole().id,
  isAuthPrototypePinFeedbackLocked,
  isAuthGateQaBypassEnabled: (...args) => isAuthGateQaBypassEnabled(...args),
  isAuthGateUnlocked: (...args) => isAuthGateUnlocked(...args),
  makeId,
  normalizeLookupText,
  normalizePlainRecord,
  normalizePlanningLaborPositiveNumber,
  normalizeShiftMasterBoardQuantity,
  normalizeShiftMasterExecutors,
  notifySaveSuccess,
  persistUiState,
  render,
  renderUiActionButton,
  renderUiEmptyState,
  renderUiModalFrame,
  renderUiModalShell,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiPanel,
  renderUiPanelBody,
  renderUiPanelFooter,
  renderUiStatusToken,
  setAuthPrototypePinDraft: (nextValue) => { authPrototypePinDraft = String(nextValue || ""); },
  setAuthPrototypeKeypadDigitsState: (nextValue) => { authPrototypeKeypadDigits = Array.isArray(nextValue) ? nextValue : []; },
  }));
}

function ensureAuthRenderModule() {
  if (authRenderModuleLoad) return authRenderModuleLoad;
  authRenderModuleLoad = import("./modules/auth_render/render.js")
    .then(({ createAuthRenderModule }) => {
      initializeAuthRenderModule(createAuthRenderModule);
    })
    .catch((error) => {
      console.error("Не удалось загрузить модуль авторизации", error);
    });
  return authRenderModuleLoad;
}

function initializeAuthEventsModule(factory) {
  ({ bindAuthPrototypeEvents, bindAuthSessionEvents, startAuthSessionTask, saveAuthSessionTaskFact } = factory({
    app,
    AUTH_PIN_TEMPORARILY_DISABLED,
    bindGenericModalCloseEvents,
    button: null,
    cancelAuthPrototypePinFeedback,
    cancelEmployeeAuthElevation: () => cancelNomenclatureEmployeeElevation(),
    completeAuthPrototypeLogin,
    deleteEmployeeSession: () => deleteEmployeeServerSession(),
    doesAuthSessionFactNeedDeviationComment: (...args) => doesAuthSessionFactNeedDeviationComment(...args),
    employeeId: "",
    formatShiftWorkOrderPersonName: (...args) => formatShiftWorkOrderPersonName(...args),
    getAuthPrototypeAttemptsLeft,
    getAuthPrototypePinDraft: () => authPrototypePinDraft,
    getAuthPrototypePeople,
    getAuthPrototypePinPerson,
    getAuthSessionFactDeviationPercent: (...args) => getAuthSessionFactDeviationPercent(...args),
    getAuthSessionFactDraft: (...args) => getAuthSessionFactDraft(...args),
    getAuthSessionPrototypeModel: (...args) => getAuthSessionPrototypeModel(...args),
    getAuthSessionTaskGoodQuantity: (...args) => getAuthSessionTaskGoodQuantity(...args),
    item: null,
    isAuthPrototypePinFeedbackLocked,
    isEmployeeAuthRequired: () => isEmployeeServerAuthRequired(),
    isEmployeeAuthElevationActive: () => isNomenclatureEmployeeElevationActive(),
    lockAuthGate,
    normalizeAuthSessionFactField,
    normalizePlainRecord,
    normalizePlanningLaborPositiveNumber,
    normalizeShiftMasterBoardQuantity,
    notifySaveSuccess,
    persistUiState,
    render,
    resetAuthPrototypeAttempts,
    // Auth events are lazy-loaded before the application event service is
    // initialized. Keep the dependency late-bound so opening a non-auth
    // module cannot fail during bootstrap.
    resetAuthPrototypePinEntry: () => {
      authPrototypePinDraft = "";
      authPrototypeKeypadDigits = [];
    },
    saveAuthSessionTaskReport: (...args) => saveAuthSessionTaskReport(...args),
    // The auth event chunk can initialize before the lazy Master Board chunk.
    // Resolve the board action at the time the executor saves a fact, loading
    // only that slice when it has not been needed by the current page yet.
    saveShiftMasterBoardFact: async (...args) => {
      if (typeof saveShiftMasterBoardFact !== "function") await ensureShiftMasterBoardModule();
      return typeof saveShiftMasterBoardFact === "function"
        ? saveShiftMasterBoardFact(...args)
        : false;
    },
    scheduleAuthPrototypePinValidation,
    setAuthSessionFactDraft: (...args) => setAuthSessionFactDraft(...args),
    setAuthSessionReportDraft: (...args) => setAuthSessionReportDraft(...args),
    setAuthPrototypePinDraft: (nextValue) => {
      authPrototypePinDraft = String(nextValue || "");
      commitRuntimeState();
    },
    status: "",
    type: "",
    updateModuleUrlParam,
    value: "",
    getUi: () => ui,
  }));
}

function ensureAuthEventsModule() {
  if (authEventsModuleLoad) return authEventsModuleLoad;
  authEventsModuleLoad = import("./modules/auth_render/events.js")
    .then(({ createAuthEventsModule }) => {
      initializeAuthEventsModule(createAuthEventsModule);
    })
    .catch((error) => {
      console.error("Не удалось загрузить обработчики авторизации", error);
    });
  return authEventsModuleLoad;
}

function ensureAuthModules() {
  return Promise.all([ensureAuthRenderModule(), ensureAuthEventsModule()])
    .then(() => {
      // The route adapter calls this function during every render. Re-render
      // only once when both lazy chunks become available; otherwise a resolved
      // promise would queue an endless render → ensure → render loop.
      if (authModulesReady) return;
      authModulesReady = true;
      if (["authPrototype", "authSessionPrototype"].includes(ui.activeModule)) render();
    });
}

let bindTimesheetEvents = () => {};
let buildTimesheetAttendanceEventsFromFormData = () => ({ ok: false, reason: "timesheet-module-pending", events: [] });
let formatTimesheetHours = (value = 0) => String(Number(value || 0));
let getTimesheetCell = () => ({ value: "work", code: "work", hours: 8, overtime: 0 });
let getTimesheetDayOption = (value = "work") => ({ value, label: value });
let getTimesheetEmployeeSchedule = () => null;
let getTimesheetModel = () => ({ rows: [] });
let moveTimesheetPeriod = () => {};
let openTimesheetEditor = () => {};
let renderTimesheetEditorModal = () => "";
let renderTimesheetPage = () => renderUiModulePage({
  ariaLabel: "Табель",
  content: renderUiEmptyState({ title: "Загружаем табель", description: "Экран откроется автоматически." }),
});
let timesheetModuleLoad = null;
function initializeTimesheetModule(factory) {
  ({
    bindTimesheetEvents,
    buildAttendanceEventsFromFormData: buildTimesheetAttendanceEventsFromFormData,
    formatTimesheetHours,
    getTimesheetCell,
    getTimesheetDayOption,
    getTimesheetEmployeeSchedule,
    getTimesheetModel,
    moveTimesheetPeriod,
    openTimesheetEditor,
    renderTimesheetEditorModal,
    renderTimesheetPage,
  } = factory({
  DAY_MS,
  TIMESHEET_DAY_OPTIONS,
  TIMESHEET_SCHEDULE_OPTIONS,
  TIMESHEET_VIEW_OPTIONS,
  addMs,
  bindGenericModalCloseEvents,
  blockProtectedDestructiveAction,
  canEditTimesheetEmployee,
  dedupeEmployeeOrgRows,
  escapeAttribute,
  escapeHtml,
  formatDate,
  fromDateInput,
  getApp: () => app,
  getDefaultUiState: () => defaultUiState,
  getEmployeeDepartmentLabelForWorkCenters,
  getPersonnelCalendarModel,
  getProductionStructureEmployees,
  getProductionStructureMatrixRuntimeOverrides,
  getUi: () => ui,
  icon,
  mapLegacyWorkCenterId,
  normalizeDateInput: (value = "") => typeof normalizeDateInput === "function" ? normalizeDateInput(value) : String(value || "").slice(0, 10),
  normalizeLookupText,
  normalizePlainRecord,
  normalizeWorkMode,
  migrateLegacyTimesheetState,
  personnelScheduleTemplates: DEFAULT_PERSONNEL_SCHEDULE_TEMPLATES,
  persistUiState,
  projectEmployeeAvailability,
  removeAttendanceEvents,
  removeScheduleAssignment,
  render,
  renderUiActionButton,
  renderUiFilterBar,
  renderUiFormActions,
  renderUiFormField,
  renderUiFormGrid,
  renderUiFormSection,
  renderUiModalFrame,
  renderUiModulePage,
  renderUiPanel,
  renderUiPanelBody,
  renderUiStatusToken,
  renderUiTableWrap,
  renderUiToolbar,
  resolveEffectiveScheduleAssignment,
  saveAttendanceEvent,
  saveScheduleAssignment,
  startOfDay,
  startOfWeek,
  toDateInput,
  }));
}

function ensureTimesheetModule() {
  if (timesheetModuleLoad) return timesheetModuleLoad;
  timesheetModuleLoad = import("./modules/timesheet/render.js")
    .then(({ createTimesheetModule }) => {
      initializeTimesheetModule(createTimesheetModule);
      if (ui.activeModule === "timesheet") render();
    })
    .catch((error) => {
      console.error("Не удалось загрузить модуль табеля", error);
      if (ui.activeModule === "timesheet") render();
    });
  return timesheetModuleLoad;
}

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
  { id: "ct-0402", name: "Чип 0402", package: "0402", family: "R/C/L", coefficient: 0.70, placementsPerHour: 64400, setupSeconds: 12, defaultCount: 42, status: "Активен" },
  { id: "ct-0603", name: "Чип 0603", package: "0603", family: "R/C/L", coefficient: 0.70, placementsPerHour: 64400, setupSeconds: 12, defaultCount: 36, status: "Активен" },
  { id: "ct-0805", name: "Чип 0805", package: "0805", family: "R/C/L", coefficient: 0.63, placementsPerHour: 58000, setupSeconds: 12, defaultCount: 18, status: "Активен" },
  { id: "ct-sot23", name: "SOT-23 / SOD", package: "SOT-23", family: "Дискреты", coefficient: 0.22, placementsPerHour: 20200, setupSeconds: 18, defaultCount: 6, status: "Активен" },
  { id: "ct-soic", name: "SOIC / TSSOP", package: "SOIC/TSSOP", family: "Микросхемы", coefficient: 0.22, placementsPerHour: 20200, setupSeconds: 26, defaultCount: 2, status: "Активен" },
  { id: "ct-qfn", name: "QFN / DFN", package: "QFN", family: "Микросхемы", coefficient: 0.06, placementsPerHour: 5500, setupSeconds: 34, defaultCount: 1, status: "Активен" },
  { id: "ct-bga", name: "BGA", package: "BGA", family: "Микросхемы", coefficient: 5.5, placementsPerHour: 3600, setupSeconds: 45, defaultCount: 0, status: "Активен" },
  { id: "ct-connector", name: "Разъем / крупный корпус", package: "Connector", family: "Крупные", coefficient: 0.06, placementsPerHour: 5520, setupSeconds: 40, defaultCount: 3, status: "Активен" },
];
const DEFAULT_BOM_LISTS = [];
const DEFAULT_SPECIFICATIONS = [];

// Business terminology after the 2026-06 rename:
// - directoryState.specifications stores product specifications with a production structure.
// - directoryState.bomLists stores boards with a BOM/component table.
// Technical keys stay unchanged to preserve existing localStorage data.
const PRODUCT_COMPOSITION_TERM = "Изделие";
const PRODUCT_COMPOSITION_TERM_LOWER = "изделие";
const PRODUCT_COMPOSITION_LIST_TERM = "Спецификации";
const PRODUCT_STRUCTURE_TERM = "Состав изделия";
const PRODUCT_STRUCTURE_TERM_LOWER = "состав изделия";
const BOARD_SPEC_TERM = "Плата";
const BOARD_SPEC_TERM_LOWER = "плата";
const BOARD_SPEC_LIST_TERM = "Платы";
const BOARD_BOM_TERM = "BOM платы";
const WORK_ORDERS_MODULE_LABEL = "Заказ-наряды";

const BOM_IMPORT_COLUMN_COUNT = 9;
const MAIN_ROUTE_TASK_ID = "__main__";
const STRUCTURE_FULFILLMENT_MODES = ["not_selected", "produce", "from_stock", "purchase", "external"];
const STRUCTURE_FULFILLMENT_LABELS = {
  not_selected: "Не выбрано",
  produce: "Произвести",
  from_stock: "Со склада",
  purchase: "Закупить",
  external: "Внешнее",
};
const STRUCTURE_FULFILLMENT_META = {
  not_selected: "требует решения",
  produce: "производственная ветка",
  from_stock: "резерв и выдача",
  purchase: "вне производства",
  external: "подрядчик / вне MES",
};
const STRUCTURE_SCHEDULABLE_FULFILLMENT_MODES = new Set(["produce", "from_stock"]);

function renderPlanningWorkbenchShellState({ title, description }) {
  return renderMesModulePatternPage({
    moduleId: "planning",
    sidebar: renderUiModuleSidebar({
      eyebrow: "Планирование",
      title: WORK_ORDERS_MODULE_LABEL,
      variant: "queue",
      className: "planning-order-queue",
      body: `<div class="ui-sidebar-list planning-order-route-list"><div class="ui-sidebar-label">${escapeHtml(description)}</div></div>`,
    }),
    header: renderUiModuleHeader({
      eyebrow: "Планирование",
      title: WORK_ORDERS_MODULE_LABEL,
      description,
      className: "planning-order-module-header is-compact",
    }),
    content: renderUiEmptyState({ title, description }),
  });
}

let renderPlanningWorkbenchPage = () => renderPlanningWorkbenchShellState({
  title: "Загружаем заказ-наряды",
  description: "Рабочее пространство откроется автоматически.",
});
let getPlanningWorkbenchModel = () => ({ routes: [], queue: [], overview: null });
let syncPlanningManualLaborToStepSlots = () => false;
let planningWorkbenchModuleLoad = null;
let planningWorkbenchModuleError = null;
function initializePlanningWorkbenchModule(factory) {
  ({
    getPlanningWorkbenchModel,
    renderPlanningWorkbenchPage,
    syncPlanningManualLaborToStepSlots,
  } = factory({
  STRUCTURE_FULFILLMENT_LABELS,
  STRUCTURE_FULFILLMENT_MODES,
  HUMAN_LABOR_RESOURCE_TYPES,
  MACHINE_LABOR_RESOURCE_TYPES,
  WORK_ORDERS_MODULE_LABEL,
  buildPlanningProductionChain,
  escapeAttribute,
  escapeHtml,
  formatDateTimeShort,
  formatDuration,
  formatWarehouseQuantity,
  fromDateInput,
  getActiveRouteForModule,
  getDefaultOperationCalculationType,
  getDomainWorkOrderProjections,
  getDomainWorkOrderDetail,
  getFulfillmentMeta,
  getMesFlowTransitionView,
  getPlanningActiveWorkItem,
  getPlanningActiveRouteId: () => ui.activeRouteId,
  getPlanningFlowReadinessSummary,
  getPlanningOrderLaborKey,
  getPlanningResourceForRouteStep,
  getPlanningRouteLaborReadiness,
  getPlanningRouteQuantity,
  getPlanningRouteStartDate,
  getPlanningRouteTransferSummary,
  getPlanningShiftOrdersForRoute,
  getPlanningState: () => planningState,
  getPlanningStepLineLabel,
  getPlanningStepTone,
  getPlanningSupplyRows,
  getPlanningSupplySummary,
  getPlanningTaskBomLabel,
  getPlanningTaskOperationStats,
  getPlanningTaskReadiness,
  getPlanningTasksForRoute,
  getPersonnelCalendarModel,
  getPlanningWorkItemId,
  getOperationMapItem,
  getProductionResource,
  getRouteDocumentKindLabel,
  getRouteDocumentKindShortLabel,
  getRouteModuleStats,
  getRouteStepLaborSnapshot,
  getRouteStepPlanningTask,
  getRouteStepQuantityForBatch,
  getRouteStepSelectedPlanningWorkCenterId,
  getRouteStepsForModule,
  getRouteTaskTypeLabel,
  getRoutesForModule,
  getResourcesForWorkCenter,
  getWarehouseBalanceForNomenclature,
  getWorkOrderViewModel,
  getWorkCenter,
  icon,
  isManufacturingOutputReceiptRouteStep,
  isSmtOperationWorkCenter,
  mapLegacyWorkCenterId,
  normalizeBoardsPerPanel,
  normalizeLookupText,
  normalizePlanningOrderLaborByStepId,
  normalizeQuantity,
  parsePlanningWorkItemId,
  renderModulePreviewEmpty,
  renderRouteTreeCell: (...args) => renderRouteTreeCell(...args),
  renderRouteTaskOutputHint,
  renderUiActionButton,
  renderUiModuleHeader,
  renderUiModulePage,
  renderUiPanel, renderUiPanelBody, renderUiStatusToken, renderUiModuleSidebar, renderUiSidebarItem, renderUiTableControlAttributes, renderUiTableWrap,
  resolveProductionResourceType,
  routeStepRequiresManualPlanningLine, toDate,
  }));
}
function ensurePlanningWorkbenchModule() {
  if (planningWorkbenchModuleLoad || planningWorkbenchModuleError) return planningWorkbenchModuleLoad;
  planningWorkbenchModuleLoad = import("./modules/planning_workbench/render.js")
    .then(({ createPlanningWorkbenchModule }) => {
      initializePlanningWorkbenchModule(createPlanningWorkbenchModule);
      if (ui.activeModule === "planning") render({ skipRememberScroll: true });
    })
    .catch((error) => { planningWorkbenchModuleError = error; });
  return planningWorkbenchModuleLoad;
}

function normalizeStatusApplicationArea(value = "") {
  const source = String(value || "").trim();
  if (!source) return "Система / Справочники";
  const legacyAreas = new Map([
    [`Производство / ${PRODUCT_COMPOSITION_LIST_TERM}`, `Технологии / ${PRODUCT_COMPOSITION_LIST_TERM}`],
    ["Производство / Планирование", "Планирование нагрузки / Планирование"],
    ["Производство / Мастерская", "Оперативное управление / Мастерская"],
    ["Производство / Диспетчерская", "Оперативное управление / Диспетчерская"],
    ["Производство / Отделы", "Система / Справочники"],
    ["Производство / Отделы и ресурсы", "Система / Справочники"],
    ["Производство / Ресурсы", "Система / Справочники"],
    ["Производство / Оборудование", "Система / Справочники"],
    ["Планирование / Заказ-наряды", "Планирование нагрузки / Заказ-наряды"],
    ["Планирование / Готовность состава", "Планирование нагрузки / Заказ-наряды"],
    ["Планирование / Структура работ", "Планирование нагрузки / Заказ-наряды"],
    ["Планирование / Сменный срез", "Оперативное управление / Мастерская и диспетчерская"],
    ["Планирование / Паспорт заказ-наряда", "Планирование нагрузки / Заказ-наряды"],
    ["Планирование / Расчетные индикаторы UI", "Планирование нагрузки / Заказ-наряды"],
    ["Справочники", "Система / Справочники"],
  ]);
  return legacyAreas.get(source) || source;
}

function makeStatusDirectoryRow(row) {
  const annotation = String(row.annotation || row.usage || "").trim();
  const baseRow = {
    id: row.id,
    group: normalizeStatusApplicationArea(row.group || "Система / Справочники"),
    registryKind: row.registryKind || getDefaultStatusRegistryKind(row),
    name: row.name,
    type: row.type || "Статус",
    code: row.code,
    contractScope: String(row.contractScope || row.scope || "").trim(),
    contractKind: String(row.contractKind || row.kind || "").trim(),
    usage: row.usage || annotation,
    annotation,
    impact: row.impact || "",
  };
  const lifecycle = getStatusLifecycleModules({ ...baseRow, ...row });
  return {
    ...baseRow,
    originModule: row.originModule || lifecycle.originModule,
    changeModule: row.changeModule || lifecycle.changeModule,
  };
}

function getDefaultStatusRegistryKind(row = {}) {
  const type = normalizeLookupText(row.type || "");
  const id = String(row.id || "");
  if (type.includes("сигнал") || type.includes("расчет") || id.startsWith("planning-supply-")) return "signal";
  if (type.includes("режим")) return "mode";
  if (type.includes("флаг")) return "flag";
  return "status";
}

function getStatusRegistryKindLabel(kind = "") {
  return {
    status: "Статус объекта",
    signal: "Расчетный сигнал",
    mode: "Режим",
    flag: "Флаг",
  }[kind] || "Статус объекта";
}

function normalizeStatusImpactText(row = {}, impact = "") {
  const source = String(impact || "").trim();
  return source;
}

function getStatusLifecycleModules(row = {}) {
  const id = String(row.id || "").trim();
  const code = String(row.code || "").trim();
  const group = normalizeLookupText(normalizeStatusApplicationArea(row.group || ""));
  const type = normalizeLookupText(row.type || "");
  const name = normalizeLookupText(row.name || "");

  const makeLifecycle = (originModule, changeModule) => ({
    originModule,
    changeModule,
  });

  if (id.startsWith("signal-")) {
    return makeLifecycle("UI-состояния", "UI-kit / визуальные правила");
  }

  if (type.includes("изделие") || group.includes("специфика")) {
    return makeLifecycle("Спецификации", "Спецификации");
  }

  if (id.startsWith("slot-") || type.includes("операция gantt")) {
    return makeLifecycle("Планирование", "Планирование / Gantt");
  }

  if (id.startsWith("route-") || type.includes("заказ") || type.includes("маршрут")) {
    return makeLifecycle("Заказ-наряды", "Заказ-наряды / Планирование");
  }

  if (id.startsWith("shift-master-")) {
    return makeLifecycle("Мастерская", "Мастерская");
  }

  if (id.startsWith("dispatch-")) {
    return makeLifecycle("Диспетчерская", "Диспетчерская");
  }

  if (id.startsWith("fulfillment-") || ["not_selected", "produce", "from_stock", "purchase", "external"].includes(code)) {
    return makeLifecycle("Спецификации", "Спецификации / Маршрутная карта / Заказ-наряды");
  }

  if (id.startsWith("planning-supply-") || id.startsWith("planning-task-")) {
    return makeLifecycle("Заказ-наряды", "Расчет из спецификации и маршрутной карты");
  }

  if (id.startsWith("planning-passport-") || id.startsWith("planning-flow-")) {
    return makeLifecycle("Заказ-наряды", "Расчет из заказ-наряда и планирования");
  }

  if (id.startsWith("planning-shift-")) {
    return makeLifecycle("Планирование", "Мастерская / Диспетчерская");
  }

  if (
    id.startsWith("directory-")
    || id.startsWith("work-center-")
    || id.startsWith("participation-")
    || id.startsWith("resource-")
    || id.startsWith("equipment-")
    || code === "active"
    || code === "inactive"
    || code === "Активен"
    || code === "Отключен"
    || name === "да"
    || name === "нет"
  ) {
    return makeLifecycle("Справочники", "Справочники");
  }

  if (id.startsWith("document-") || type.includes("технолог")) {
    return makeLifecycle("Технологии", "Спецификации / Номенклатура / Маршрутная карта");
  }

  if (group.includes("планирование")) {
    return makeLifecycle("Планирование нагрузки", "Планирование / Заказ-наряды");
  }

  if (group.includes("оперативное")) {
    return makeLifecycle("Оперативное управление", "Мастерская / Диспетчерская");
  }

  if (group.includes("технолог")) {
    return makeLifecycle("Технологии", "Технологические модули");
  }

  return makeLifecycle("Справочники", "Справочники");
}

const DEFAULT_STATUSES = [
  ...GANTT_SLOT_STATUS_OPTIONS.map((status) => makeStatusDirectoryRow({
    id: `slot-${status.value}`,
    group: "Планирование нагрузки / Планирование",
    name: status.label,
    type: "Операция Gantt",
    code: status.value,
    contractScope: "ganttSlot",
    contractKind: status.kind || "executionStatus",
    annotation: `Статус запланированной операции на диаграмме планирования: ${status.label}.`,
    impact: "Влияет на Gantt, прогресс маршрутной карты, предупреждения, мастерскую, диспетчерскую и ожидаемые складские поступления.",
  })),
  ...[
    {
      id: "route-queued",
      name: "В очереди",
      code: "queued",
      annotation: "Расчетное состояние заказ-наряда: документ выбран, но слоты по нему еще не созданы.",
      impact: "Используется в панели заказ-нарядов и подсказывает, что следующий шаг - передача операций в планирование.",
    },
    {
      id: "route-partial",
      name: "Частично",
      code: "partial",
      annotation: "Часть операций заказ-наряда уже размещена, часть еще остается вне диаграммы.",
      impact: "Подсвечивает неполную постановку маршрута и помогает найти разрыв между маршрутной картой и планированием.",
    },
    {
      id: "route-scheduled",
      name: "В планировании",
      code: "scheduled",
      annotation: "Маршрутная карта перенесена в диаграмму планирования полностью или по текущему расчету.",
      impact: "Операции появляются на диаграмме; становятся доступны мастерской, диспетчерской и складским ожиданиям.",
    },
    {
      id: "route-canceled",
      name: "Отменен",
      code: "canceled",
      annotation: "Заказ-наряд отменен, связанные операции снимаются из диаграммы.",
      impact: "Исключает документ из активного производственного планирования и очищает связанные слоты при отмене.",
    },
  ].map((row) => makeStatusDirectoryRow({
    ...row,
    group: "Планирование нагрузки / Заказ-наряды",
    type: "Маршрут / заказ-наряд",
    contractScope: "workOrderPlanning",
    contractKind: row.code === "canceled" ? "lifecycleStatus" : "planningStatus",
  })),
  ...[
    {
      id: "shift-master-draft",
      name: "План смены",
      code: "draft",
      annotation: "Сменная строка видна мастеру, но еще не выпущена как сменный заказ-наряд.",
      impact: "Остается доступной для распределения по ресурсу и исполнителю; в диспетчерской считается планом без выпуска мастером.",
    },
    {
      id: "shift-master-issued",
      name: "Выпущен",
      code: "issued",
      annotation: "Мастер распределил сменную строку и выпустил ее в работу.",
      impact: "Строка становится полноценным сменным заказ-нарядом для диспетчерской и печатного сменного листа.",
    },
  ].map((row) => makeStatusDirectoryRow({
    ...row,
    group: "Оперативное управление / Мастерская",
    type: "Сменный заказ-наряд",
    contractScope: "shiftAssignment",
    contractKind: "shiftStatus",
  })),
  ...STRUCTURE_FULFILLMENT_MODES.map((mode) => makeStatusDirectoryRow({
    id: `fulfillment-${mode}`,
    group: "Технологии / Обеспечение состава",
    name: STRUCTURE_FULFILLMENT_LABELS[mode],
    type: "Режим обеспечения",
    code: mode,
    annotation: STRUCTURE_FULFILLMENT_META[mode],
    impact: "Влияет на готовность состава изделия, правила создания операций маршрута, потребность склада/снабжения и попадание ветки в планирование.",
  })),
  ...[
    ["planning-supply-select", "Выберите обеспечение", "select_fulfillment", "Для строки состава изделия не выбран способ обеспечения.", "Блокирует понятную подготовку заказ-наряда и требует решения: производить, взять со склада, закупить или вынести во внешнее обеспечение."],
    ["planning-supply-route-needed", "Нужен маршрут", "route_required", "Строка должна производиться, но для нее нет операций маршрута.", "Создает предупреждение в структуре работ и не дает считать ветку готовой к плану."],
    ["planning-supply-no-production", "Нет производственной операции", "no_production_step", "Ветка отмечена как производственная, но среди операций нет производственной операции.", "Подсвечивает ошибку маршрутной карты перед размещением в планировании."],
    ["planning-supply-production", "Производственная ветка", "production_branch", "Ветка состава изделия обеспечивается собственным производством и имеет производственные операции.", "Разрешает воспринимать ветку как планируемую производственную часть заказ-наряда."],
    ["planning-supply-remove-production", "Уберите производственные операции", "remove_production_steps", "Строка идет со склада, но в маршруте остались производственные операции.", "Предупреждает о конфликте между обеспечением со склада и производственным маршрутом."],
    ["planning-supply-warehouse-issue-needed", "Нужна складская выдача", "warehouse_issue_required", "Строка идет со склада, но маршрут не содержит выдачу в производство.", "Требует добавить складскую операцию, чтобы связать склад и производство."],
    ["planning-supply-warehouse-issue", "Складская выдача", "warehouse_issue", "Ветка обеспечивается со склада и имеет операцию выдачи.", "Разрешает считать складскую часть маршрута подготовленной."],
    ["planning-supply-purchase-outside", "Закупка вне планирования", "purchase_outside_gantt", "Строка состава обеспечивается закупкой и не ставится в производственный Gantt.", "Переносит контроль в снабжение и исключает производственные операции для этой ветки."],
    ["planning-supply-external", "Внешнее обеспечение", "external_fulfillment", "Строка состава выполняется вне MES или подрядчиком.", "Оставляет ветку вне производственного планирования и требует внешнего контроля."],
  ].map(([id, name, code, annotation, impact]) => makeStatusDirectoryRow({
    id,
    group: "Планирование нагрузки / Заказ-наряды",
    name,
    type: "Расчетный статус готовности",
    code,
    annotation,
    impact,
  })),
  ...[
    ["planning-task-link", "Проверьте связь", "check_link", "Объект маршрута потерял связь с актуальной строкой состава изделия.", "Требует проверки маршрутной карты и структуры изделия перед планированием."],
    ["planning-task-fulfillment", "Обеспечение не выбрано", "fulfillment_missing", "Для составной части не выбран режим обеспечения.", "Не дает считать ветку готовой к заказ-наряду."],
    ["planning-task-outside", "Вне маршрута", "outside_route", "Ветка не должна попадать в производственный маршрут.", "Исключает ветку из производственных операций и планирования."],
    ["planning-task-no-operations", "Нет операций", "no_steps", "Для ветки нет операций маршрута.", "Требует заполнить маршрутную карту перед передачей в планирование."],
    ["planning-task-extra-production", "Лишние производственные операции", "extra_production_steps", "Ветка не должна производиться, но содержит производственные операции.", "Предупреждает о лишних операциях и возможном дублировании работ."],
    ["planning-task-smt-line", "Выберите SMT-участок", "smt_line_required", "SMT-операция требует выбора конкретной линии планирования.", "Без выбора линии операция не может корректно попасть в Gantt."],
    ["planning-task-bom", "BOM не привязан", "bom_required", "Для платы или BOM-ветки отсутствует связанный BOM.", "Блокирует корректный расчет состава, мультипликации и SMT-трудоемкости."],
    ["planning-task-ready", "Готово к плану", "ready_for_plan", "Ветка состава изделия имеет достаточные данные для постановки в план.", "Позволяет переходить к размещению операций в планировании."],
  ].map(([id, name, code, annotation, impact]) => makeStatusDirectoryRow({
    id,
    group: "Планирование нагрузки / Заказ-наряды",
    name,
    type: "Расчетный статус ветки",
    code,
    annotation,
    impact,
  })),
  ...[
    ["planning-shift-empty", "Пусто", "empty", "В выбранной смене нет строк заказ-наряда.", "Отображается в сменном срезе, когда плановые операции не найдены."],
    ["planning-shift-planned", "Запланирован", "planned", "Сменный срез содержит плановые операции без проблемных статусов.", "Используется как агрегированное состояние сменного заказ-наряда."],
    ["planning-shift-in-progress", "В работе", "in_progress", "В сменном срезе есть операции в работе.", "Показывает активное выполнение сменного задания."],
    ["planning-shift-paused", "Пауза", "paused", "В сменном срезе есть остановленные операции.", "Требует внимания мастера или диспетчера к остановке."],
    ["planning-shift-closed", "Закрыт", "closed", "Все операции сменного среза завершены.", "Позволяет считать сменный срез закрытым по статусам операций."],
    ["planning-shift-problem", "Проблема", "problem", "В сменном срезе есть проблемные или просроченные операции.", "Поднимает критичный сигнал для диспетчерской и контроля смены."],
  ].map(([id, name, code, annotation, impact]) => makeStatusDirectoryRow({
    id,
    group: "Оперативное управление / Мастерская и диспетчерская",
    name,
    type: "Агрегированный статус смены",
    code,
    annotation,
    impact,
  })),
  ...[
    {
      id: "directory-active-ru",
      group: "Система / Справочники",
      name: "Активен",
      type: "Строка справочника",
      code: "Активен",
      annotation: "Запись справочника доступна для выбора и участия в расчетах.",
      impact: "Используется операциями, типами компонентов, номенклатурой и статусными строками как активное состояние.",
    },
    {
      id: "directory-disabled-ru",
      group: "Система / Справочники",
      name: "Отключен",
      type: "Строка справочника",
      code: "Отключен",
      annotation: "Запись справочника исключена из активного использования.",
      impact: "Отключенные ресурсы и строки не подставляются в планирование, расчет и выбор в формах.",
    },
    {
      id: "work-center-active",
      group: "Система / Справочники",
      name: "Активен",
      type: "Отдел",
      code: "active",
      annotation: "Отдел включен в организационную модель.",
      impact: "Отдел участвует в справочнике, может отображаться в планировании, ресурсах и карте производства при включенных признаках.",
    },
    {
      id: "work-center-inactive",
      group: "Система / Справочники",
      name: "Отключен",
      type: "Отдел",
      code: "inactive",
      annotation: "Отдел отключен на уровне внутреннего кода.",
      impact: "Отдел исключается из активной производственной логики и не должен использоваться для новых операций.",
    },
    {
      id: "participation-yes",
      group: "Система / Справочники",
      name: "Да",
      type: "Признак участия",
      code: "yes",
      annotation: "Отдел или ресурс участвует в планировании либо расчете.",
      impact: "Разрешает использовать отдел/ресурс в Gantt, трудоемкости и расчетах производительности.",
    },
    {
      id: "participation-no",
      group: "Система / Справочники",
      name: "Нет",
      type: "Признак участия",
      code: "no",
      annotation: "Отдел или ресурс исключен из планирования либо расчета.",
      impact: "Запрещает подстановку в Gantt/расчет, но сохраняет запись в справочнике как мастер-данные.",
    },
    {
      id: "resource-available",
      group: "Система / Справочники",
      name: "Доступен",
      type: "Производственный ресурс",
      code: "Доступен",
      annotation: "Линия, пост, стенд или оборудование доступны для планирования.",
      impact: "Ресурс может быть выбран в маршруте, мастерской, расчетах и отображаться на карте производства.",
    },
    {
      id: "resource-loaded",
      group: "Система / Справочники",
      name: "Загружен",
      type: "Производственный ресурс",
      code: "Загружен",
      annotation: "Ресурс занят или имеет высокую текущую нагрузку.",
      impact: "Подсказывает диспетчерскую/планировочную нагрузку, но сам по себе не блокирует расчет без отдельного правила.",
    },
    {
      id: "equipment-working",
      group: "Система / Справочники",
      name: "Работает",
      type: "Оборудование",
      code: "Работает",
      annotation: "Оборудование исправно и доступно в составе производственного ресурса.",
      impact: "Подтверждает возможность использовать оборудование в визуальной карте и справочнике ресурсов.",
    },
    {
      id: "equipment-check",
      group: "Система / Справочники",
      name: "Проверка",
      type: "Оборудование",
      code: "Проверка",
      annotation: "Оборудование или связанные с ним данные требуют проверки.",
      impact: "Должно привлекать внимание к ресурсу перед планированием или эксплуатацией.",
    },
    {
      id: "document-draft",
      group: "Технологии / Документы",
      name: "Черновик",
      type: "Технологические данные",
      code: "Черновик",
      annotation: "Изделие, плата, BOM или технологический документ еще не утверждены.",
      impact: "Подсказывает, что данные можно редактировать и нужно проверить перед передачей в маршрут/планирование.",
    },
    {
      id: "document-ready",
      group: "Технологии / Документы",
      name: "Готова",
      type: "Технологические данные",
      code: "Готова",
      annotation: "Импортированный BOM или связанная технологическая запись готовы к использованию.",
      impact: "Разрешает воспринимать запись как рабочую основу для состава изделия, маршрута и расчетов.",
    },
  ].map(makeStatusDirectoryRow),
  ...[
    ["planning-passport-ready", "Готов", "ready", "Карточка подготовки имеет выбранный состав изделия или достаточный входной объект.", "Показывает, что этап паспорта заказ-наряда заполнен и можно переходить к следующей проверке."],
    ["planning-passport-no-specification", "Нет состава изделия", "no_specification", "Для подготовки заказ-наряда не выбран состав изделия.", "Блокирует сквозную готовность карточки и требует выбрать или создать состав изделия."],
    ["planning-passport-linked", "Привязана", "linked", "Состав изделия привязан к производственному объекту.", "Подтверждает связь заказ-наряда со спецификацией и позволяет считать структуру источником маршрута."],
    ["planning-passport-no-link", "Нет СП", "no_specification_link", "Связь с составом изделия отсутствует.", "Подсказывает, что маршрут или заказ-наряд не имеет надежного источника структуры."],
    ["planning-passport-boards", "Платы есть", "boards_linked", "В составе или маршруте есть привязанные платы/BOM.", "Разрешает использовать плату как источник SMT-потребности и снабжения."],
    ["planning-passport-no-boards", "Нет плат", "no_boards", "Для состава изделия не найдены привязанные платы.", "Предупреждает, что SMT/BOM-контроль может быть неполным."],
    ["planning-passport-route", "Маршрут есть", "route_ready", "Маршрутная карта содержит операции.", "Позволяет передавать операции в планирование и строить сменные задания."],
    ["planning-passport-no-route", "Нет маршрута", "no_route", "Маршрутная карта или ветка состава не содержит операций.", "Блокирует корректное размещение в планировании до заполнения операций."],
    ["planning-passport-slots", "Размещен", "scheduled", "Операции заказ-наряда уже размещены на диаграмме планирования.", "Дает основание для мастерской, диспетчерской и сменных заказ-нарядов."],
    ["planning-passport-no-slots", "Нет слотов", "no_slots", "По заказ-наряду нет размещенных операций на диаграмме.", "Оставляет документ вне оперативного сменного контроля."],
    ["planning-passport-backlog", "В очереди", "backlog", "Есть операции или ветки, ожидающие размещения.", "Показывает неполную постановку документа в планирование."],
  ].map(([id, name, code, annotation, impact]) => makeStatusDirectoryRow({
    id,
    group: "Планирование нагрузки / Заказ-наряды",
    name,
    type: "Расчетный индикатор",
    code,
    annotation,
    impact,
  })),
  ...[
    ["planning-flow-ready", "готово", "ready", "Расчетный раздел структуры заказ-наряда не содержит блокирующих проблем.", "Позволяет воспринимать соответствующий этап как подготовленный."],
    ["planning-flow-has-problems", "есть проблемы", "has_problems", "Расчетный раздел содержит одну или несколько проблем.", "Поднимает предупреждение в структуре работ и требует перейти в проблемный раздел."],
    ["planning-flow-prepare", "подготовить", "prepare", "Для раздела еще нет достаточных данных или ожидаемого размещения.", "Оставляет этап в нейтральном состоянии до выполнения следующего действия."],
    ["planning-flow-transfer", "передача", "transfer", "Размещение или передача операций в планирование еще не выполнены.", "Подсказывает, что следующий шаг связан с переносом задания в диаграмму."],
    ["planning-flow-missing-placement", "не размещено", "not_scheduled", "Часть ожидаемых операций отсутствует на диаграмме планирования.", "Показывает количественный разрыв между маршрутом и планом."],
    ["planning-flow-after-gantt", "после Ганта", "after_gantt", "Сменные наряды появятся только после размещения операций на диаграмме.", "Объясняет, почему мастерская и диспетчерская еще не получили сменные строки."],
    ["planning-flow-smt", "SMT", "smt_step", "Операция относится к SMT-контексту или требует выбора SMT-линии.", "Влияет на балансировку установщиков, выбор линии и расчет производительности."],
    ["planning-flow-route", "маршрут", "route_step", "Операция относится к обычному маршрутному шагу без отдельной SMT-специализации.", "Используется как нейтральный типовой индикатор операции в структуре работ."],
    ["planning-flow-operations-set", "операции заданы", "operations_set", "Для ветки или финального маршрута есть операции.", "Позволяет считать соответствующую часть маршрута заполненной."],
    ["planning-flow-final-operation-needed", "нужна финальная операция", "final_operation_required", "Финальная часть маршрута не содержит завершающей операции.", "Предупреждает, что выпуск изделия не описан до конца."],
  ].map(([id, name, code, annotation, impact]) => makeStatusDirectoryRow({
    id,
    group: "Планирование нагрузки / Заказ-наряды",
    name,
    type: "Расчетный индикатор",
    code,
    annotation,
    impact,
  })),
  ...Object.entries(MES_SIGNAL_TYPES).map(([code, signal]) => makeStatusDirectoryRow({
    id: `signal-${code}`,
    group: "UI-состояния / Системные сигналы",
    name: signal.label,
    type: "Визуальный сигнал",
    code,
    annotation: `Единый визуальный смысл: ${signal.label}.`,
    impact: "Влияет на цвет, подсветку и восприятие состояния в разных модулях; бизнес-данные напрямую не изменяет.",
  })),
];
const REMOVED_DIRECTORY_STATUS_ID_PREFIXES = ["project-", "supply-ui-", "warehouse-movement-", "route-planned", "dispatch-"];
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
const PRODUCTION_FLOW_STAGE_DEFINITIONS = [
  { id: "warehouse", label: "Склад", caption: "выдача и возврат", workCenterIds: ["D1"], iconName: getMesCustomIconName("department-warehouse") || "warehouse", tone: "slate" },
  { id: "smt", label: "SMT", caption: "поверхностный монтаж", workCenterIds: ["D3", "D3_L1", "D3_L2"], iconName: getMesCustomIconName("department-smt") || "bom", tone: "blue" },
  { id: "aoi", label: "AOI", caption: "оптическая инспекция", workCenterIds: ["D3_AOI"], iconName: getMesCustomIconName("unit-aoi") || "search", tone: "cyan" },
  { id: "wash", label: "Отмывка", caption: "ультразвук", workCenterIds: ["D3_UW"], iconName: "refresh", tone: "green" },
  { id: "coating", label: "Влагозащита", caption: "ручная и селективная", workCenterIds: ["D3_CC"], iconName: getMesCustomIconName("department-coating") || "package", tone: "green" },
  { id: "manual", label: "Ручной монтаж", caption: "THT и пайка", workCenterIds: ["D5"], iconName: getMesCustomIconName("department-manual-assembly") || "operation", tone: "amber" },
  { id: "quality", label: "ОТК", caption: "контроль", workCenterIds: ["D4"], iconName: getMesCustomIconName("department-qc") || "check", tone: "violet" },
  { id: "programming", label: "Прошивка", caption: "подготовка изделий", workCenterIds: ["D6"], iconName: getMesCustomIconName("department-firmware") || "settings", tone: "blue" },
  { id: "assembly", label: "Сборка", caption: "слесарно-сборочный отдел", workCenterIds: ["D9"], iconName: getMesCustomIconName("department-mechanical-assembly") || "tree", tone: "violet" },
  { id: "packing", label: "Упаковка", caption: "маркировка и упаковка", workCenterIds: ["D11"], iconName: getMesCustomIconName("department-marking-packaging") || "package", tone: "slate" },
];
let directoryEntityRemovalAllowed = false;
let planningEntityRemovalAllowed = false;
let directoryState = null;
let planningState = null;
let ui = null;
let runtimeStateService = {};
const sharedStateModuleHydrations = new Set();
const sharedStateModuleHydrationStates = new Map();
function getSharedStateModuleHydrationKey(moduleId, valueKeys = []) {
  const keys = [...new Set(valueKeys.filter(Boolean))].sort();
  return moduleId && keys.length ? `${moduleId}:${keys.join(",")}` : "";
}
function getSharedStateModuleHydrationState(moduleId, valueKeys = []) {
  const hydrationKey = getSharedStateModuleHydrationKey(moduleId, valueKeys);
  if (!hydrationKey) return { status: "error", reason: "read-unavailable", message: "Shared-state projection is not declared." };
  if (!sharedStateModuleHydrationStates.has(hydrationKey)) {
    sharedStateModuleHydrationStates.set(hydrationKey, { status: "idle", reason: "", message: "", version: 0, retryAt: 0 });
  }
  const state = sharedStateModuleHydrationStates.get(hydrationKey);
  const versions = sharedStateStatus.valueHydrationVersions || {};
  const hydratedVersion = Math.min(...valueKeys.map((key) => Number(versions[key] || 0)));
  if (Number.isFinite(hydratedVersion) && hydratedVersion > Number(state.version || 0)) state.version = hydratedVersion;
  return state;
}
function hydrateSharedStateForModule(moduleId, valueKeys = [], { allowBeforeInitialSync = false, failClosed = false } = {}) {
  const keys = [...new Set(valueKeys.filter(Boolean))];
  if (!moduleId || !keys.length) return null;
  const hydrationKey = getSharedStateModuleHydrationKey(moduleId, keys);
  const hydrationState = getSharedStateModuleHydrationState(moduleId, keys);
  const observedOwnerVersion = Math.max(
    Number(sharedStateStatus.version || 0),
    Number(sharedStateStatus.latestObservedVersion || 0),
  );
  const stale = failClosed
    && hydrationState.status === "ready"
    && observedOwnerVersion > Number(hydrationState.version || 0);
  if (stale) sharedStateModuleHydrations.delete(hydrationKey);
  const retryCoolingDown = failClosed
    && hydrationState.status === "error"
    && Date.now() < Number(hydrationState.retryAt || 0);
  if (sharedStateModuleHydrations.has(hydrationKey) || retryCoolingDown) return hydrationState;
  sharedStateModuleHydrations.add(hydrationKey);
  hydrationState.status = "loading";
  hydrationState.reason = "";
  hydrationState.message = "";
  hydrationState.retryAt = 0;
  void runtimeStateService?.hydrateSharedStateValues?.(keys, { allowBeforeInitialSync, throwOnError: failClosed }).then((hydrated) => {
    // A user can switch modules while the initial shared-state handshake is
    // still running.  Do not cache that temporary miss: the render triggered
    // after bootstrap must be able to request the deferred projection again.
    if (!hydrated) {
      sharedStateModuleHydrations.delete(hydrationKey);
      hydrationState.status = failClosed ? "error" : "idle";
      hydrationState.reason = failClosed
        ? (sharedStateStatus.configured ? "read-unavailable" : "shared-state-unconfigured")
        : "";
      hydrationState.message = failClosed ? "Shared-state projection was not returned." : "";
      hydrationState.retryAt = failClosed ? Date.now() + 3_000 : 0;
      if (failClosed && ui.activeModule === moduleId) render({ skipRememberScroll: true });
      return;
    }
    if (keys.includes(DIRECTORY_STORAGE_KEY)) {
      directoryState = loadDirectoryState();
      // A fail-closed permanent read must stay read-only. Missing compatibility
      // defaults are a data-quality condition, not permission to write them
      // back while the user is merely opening Nomenclature.
      if (!failClosed) ensureStatusDirectoryDefaults();
    }
    if (keys.includes(SYSTEM_DOMAINS_STORAGE_KEY)) {
      // Do not eagerly recreate the legacy matrix when the remote value is a
      // PostgreSQL-primary tombstone.  A present local cache remains useful
      // for the first paint; a blank cache waits for the compact server read.
      reloadSystemDomainsState({
        source: "shared-module-hydration",
        migrateLegacy: false,
      });
      void hydrateSystemDomainsServerRead(moduleId, {
        fallbackToLegacy: !systemDomainsState && !hasObservedSystemDomainsPrimaryAuthority(),
      });
    }
    hydrationState.status = "ready";
    hydrationState.reason = "";
    hydrationState.message = "";
    hydrationState.version = Math.min(...keys.map((key) => Number(sharedStateStatus.valueHydrationVersions?.[key] || 0)));
    hydrationState.retryAt = 0;
    if (ui.activeModule === moduleId) {
      const updatedMountedNomenclature = moduleId === "nomenclature"
        && ui.activeNomenclaturePane !== "boards"
        && getNomenclatureReactActivation().runtimeMode === "react"
        && nomenclatureReactIslandHost.update();
      if (!updatedMountedNomenclature) render({ skipRememberScroll: true });
    }
  }).catch((error) => {
    sharedStateModuleHydrations.delete(hydrationKey);
    hydrationState.status = failClosed ? "error" : "idle";
    hydrationState.reason = failClosed ? "read-unavailable" : "";
    hydrationState.message = failClosed ? String(error?.message || error || "Shared-state read failed.") : "";
    hydrationState.retryAt = failClosed ? Date.now() + 3_000 : 0;
    // Evaluation/legacy surfaces retain their local projection. Permanent
    // surfaces render their bounded error shell instead of silently using it.
    if (failClosed && ui.activeModule === moduleId) render({ skipRememberScroll: true });
  });
  return hydrationState;
}

// The planning workbench already reads its list and active order from the
// compact server projection. Keep the large compatibility System Domains
// snapshot off its navigation path; only placement needs the complete
// calendar/resource model.
async function ensurePlanningSystemDomains() {
  const server = await hydrateSystemDomainsServerRead("planning", {
    fallbackToLegacy: false,
  });
  if (server.ok === true || systemDomainsState) return true;
  // Only a contour that still advertises an active/mixed-version
  // compatibility projection may read the legacy key after the PostgreSQL
  // request fails. A retired primary never reintroduces shared-state as the
  // scheduling source.
  if (["active", "unknown"].includes(systemDomainsCompatibilityState)) {
    const hydrated = await runtimeStateService?.hydrateSharedStateValues?.([SYSTEM_DOMAINS_STORAGE_KEY]);
    if (hydrated) reloadSystemDomainsState({
      source: "planning-scheduling-compatibility-fallback",
      migrateLegacy: false,
    });
  }
  return Boolean(systemDomainsState);
}
let workOrdersReadModel = null;
let planningRuntimeProjectionReadModel = null;
let canApplyPlanningRuntimeProjection = () => false;
let planningDomainApiModuleLoad = null;
let planningWorkbenchSnapshotFallbackState = "idle";
let planningWorkbenchSnapshotFallbackPromise = null;
let planningRuntimeProjectionLoad = null;
let planningRuntimeProjectionForceRefreshRequested = false;
let ganttPlanningProjectionGateLoad = null;
let ganttPlanningFallbackReady = false;
let ganttPlanningFallbackAttempted = false;
let ganttPlanningFallbackAwaitingInitialSharedSnapshot = false;
let ganttPlanningModuleWasActive = false;
const PLANNING_STARTUP_PROJECTION_MODULE_IDS = new Set([
  // These modules directly render the legacy route / step / slot graph. Keep
  // their established BFF -> narrow-snapshot fallback until their own bounded
  // domain read models replace it.
  "planning",
  "gantt",
  "shiftMasterBoard",
  "shiftWorkOrders",
]);
let planningRuntimeProjectionState = { status: "idle", error: "", revision: 0 };
const systemDomainsReadModel = createSystemDomainsReadModel();
const systemDomainsCommands = createSystemDomainsCommands();
let shiftExecutionDispatchReadModel = null;
let shiftExecutionCommands = null;
let shiftExecutionOutbox = null;
let buildShiftMasterBoardAssignmentWrite = null;
let buildShiftMasterBoardFactWrite = null;
let buildShiftMasterBoardCarryoverWrite = null;
let buildShiftMasterBoardCarryoverCancelWrite = null;
let executeShiftMasterBoardServerWrite = null;
let projectShiftExecutionDispatchProjection = null;
let reconcileShiftMasterBoardCarryovers = null;
let shiftExecutionDomainApiModuleLoad = null;
let shiftExecutionServerState = { status: "idle", primaryPostgres: false, schemaReady: false, commandsEnabled: false, coverageComplete: false, error: "" };
let shiftExecutionOutboxFlushInFlight = false;
let systemDomainsServerReadState = { status: "idle", error: "", revision: 0 };
let systemDomainsServerCommandState = { status: "idle", enabled: false, surfaces: [], primaryAuthority: false, error: "" };
let systemDomainsServerCapabilitiesPromise = null;
let systemDomainsServerCapabilitiesFetchedAt = 0;
let systemDomainsServerReadRetryTimer = null;
let systemDomainsServerReadRenderModuleId = "";
let systemDomainsServerReadPromise = null;
let systemDomainsCompatibilityState = "unknown";
let systemDomainsCompatibilityHydrated = false;
const SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES = ["production-structure", "timesheet", "access-control"];
const SYSTEM_DOMAINS_CAPABILITIES_RECHECK_MS = 5_000;
function hasSystemDomainsPrimaryTombstoneHint() {
  return window.sessionStorage?.getItem(SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY) === "1";
}
function hasSystemDomainsServerCommandCoverage() {
  return systemDomainsServerCommandState.enabled === true
    && SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES.every((surface) => systemDomainsServerCommandState.surfaces.includes(surface));
}
function hasObservedSystemDomainsPrimaryAuthority() {
  return systemDomainsServerCommandState.primaryAuthority === true || hasSystemDomainsPrimaryTombstoneHint();
}
function canFallbackToLegacySystemDomains(fallbackToLegacy = false) {
  return fallbackToLegacy === true
    && systemDomainsCompatibilityState === "absent"
    && !systemDomainsState
    && !hasObservedSystemDomainsPrimaryAuthority();
}

async function handleSystemDomainsCompatibilityStatus({ state = "unknown" } = {}) {
  systemDomainsCompatibilityState = ["retired", "active", "absent"].includes(state) ? state : "unknown";
  systemDomainsCompatibilityHydrated = false;
  // Active and mixed-version/unknown servers must provide the exact remote
  // compatibility value before any legacy fallback is considered. A failed
  // targeted read remains fail-closed; it never imports and pushes the bundled
  // matrix as though the key were absent.
  if (["active", "unknown"].includes(systemDomainsCompatibilityState)) {
    systemDomainsCompatibilityHydrated = await runtimeStateService?.hydrateSharedStateValues?.(
      [SYSTEM_DOMAINS_STORAGE_KEY],
      { allowBeforeInitialSync: true },
    ) === true;
    if (systemDomainsCompatibilityHydrated) {
      reloadSystemDomainsState({ source: "startup-active-compatibility", migrateLegacy: false });
    }
  }
  // PostgreSQL capability/read-model refresh is independent from the
  // shared-state revision gate. Start it, but do not hold every metadata poll
  // (and therefore Nomenclature's exact re-hydration) behind that potentially
  // slow network request.
  void hydrateSystemDomainsServerRead("startup", {
    fallbackToLegacy: systemDomainsCompatibilityState === "absent"
      && startupDataMigrationRequired
      && !systemDomainsState,
  });
  return systemDomainsCompatibilityState;
}
function hasSystemDomainsServerAuthority() {
  // Complete command coverage is needed for writes, but must not be confused
  // with a completed root-controlled primary cutover. The latter has a
  // durable PostgreSQL authority marker (or an already-received tombstone).
  return hasSystemDomainsServerCommandCoverage() && hasObservedSystemDomainsPrimaryAuthority();
}
function hydrateSystemDomainsServerCommands() {
  if (systemDomainsServerCommandState.status === "ready"
    && Date.now() - systemDomainsServerCapabilitiesFetchedAt < SYSTEM_DOMAINS_CAPABILITIES_RECHECK_MS) return Promise.resolve(systemDomainsServerCommandState);
  if (systemDomainsServerCapabilitiesPromise) return systemDomainsServerCapabilitiesPromise;
  systemDomainsServerCommandState = { ...systemDomainsServerCommandState, status: "loading", error: "" };
  systemDomainsServerCapabilitiesPromise = systemDomainsCommands.getCapabilities().then((result) => {
    systemDomainsServerCommandState = {
      status: "ready",
      enabled: result.ok && result.enabled === true,
      surfaces: result.ok && Array.isArray(result.capabilities?.serverCommandSurfaces) ? result.capabilities.serverCommandSurfaces : [],
      primaryAuthority: result.ok && result.capabilities?.consistency?.details?.authority?.mode === "postgres-primary",
      error: result.ok ? "" : (result.error || "System Domains command capabilities are unavailable"),
    };
    systemDomainsServerCapabilitiesFetchedAt = Date.now();
    return systemDomainsServerCommandState;
  }).catch(() => {
    systemDomainsServerCommandState = { status: "ready", enabled: false, surfaces: [], primaryAuthority: hasSystemDomainsPrimaryTombstoneHint(), error: "System Domains command capabilities are unavailable" };
    systemDomainsServerCapabilitiesFetchedAt = Date.now();
    return systemDomainsServerCommandState;
  }).finally(() => { systemDomainsServerCapabilitiesPromise = null; });
  return systemDomainsServerCapabilitiesPromise;
}
function scheduleSystemDomainsServerReadRetry(moduleId = "") {
  if (systemDomainsServerReadRetryTimer) return;
  systemDomainsServerReadRetryTimer = window.setTimeout(() => {
    systemDomainsServerReadRetryTimer = null;
    void hydrateSystemDomainsServerRead(moduleId, { fallbackToLegacy: false });
  }, SYSTEM_DOMAINS_CAPABILITIES_RECHECK_MS);
}
function renderSystemDomainsServerReadConsumer(moduleId = "") {
  const activeModuleId = String(ui?.activeModule || "");
  if (!activeModuleId || (activeModuleId !== moduleId && activeModuleId !== systemDomainsServerReadRenderModuleId)) return;
  if (systemDomainsServerReadRenderModuleId === activeModuleId) systemDomainsServerReadRenderModuleId = "";
  render({ skipRememberScroll: true });
}
function hydrateSystemDomainsServerRead(moduleId = "", { fallbackToLegacy = false, force = false } = {}) {
  if (moduleId && (!systemDomainsServerReadRenderModuleId || ui?.activeModule === moduleId)) systemDomainsServerReadRenderModuleId = moduleId;
  if (systemDomainsServerReadPromise) return systemDomainsServerReadPromise;
  if (!force && systemDomainsServerReadState.status === "fallback" && systemDomainsServerReadRetryTimer !== null) {
    return Promise.resolve({ ok: false, pending: true, error: systemDomainsServerReadState.error || "System Domains read retry is pending" });
  }
  const readPromise = performSystemDomainsServerRead(moduleId, { fallbackToLegacy, force });
  systemDomainsServerReadPromise = readPromise;
  void readPromise.finally(() => { if (systemDomainsServerReadPromise === readPromise) systemDomainsServerReadPromise = null; });
  return readPromise;
}
async function performSystemDomainsServerRead(moduleId = "", { fallbackToLegacy = false, force = false } = {}) {
  try {
    systemDomainsServerReadState = { ...systemDomainsServerReadState, status: "loading", error: "" };
    const [result] = await Promise.all([systemDomainsReadModel.refresh({ force }), hydrateSystemDomainsServerCommands()]);
    if (!result.ok || !result.item) {
      systemDomainsServerReadState = { status: "fallback", error: result.error || "", revision: 0 };
      if (canFallbackToLegacySystemDomains(fallbackToLegacy)) reloadSystemDomainsState({ source: "server-read-fallback", migrateLegacy: true });
      scheduleSystemDomainsServerReadRetry(moduleId);
      renderSystemDomainsServerReadConsumer(moduleId);
      return { ok: false, error: systemDomainsServerReadState.error };
    }
    const loaded = loadSystemDomains(result.item);
    if (!hasActivatableSystemDomains(loaded.domains, loaded.report)) {
      systemDomainsServerReadState = { status: "fallback", error: "Server projection is not activatable", revision: 0 };
      if (canFallbackToLegacySystemDomains(fallbackToLegacy)) reloadSystemDomainsState({ source: "server-read-invalid", migrateLegacy: true });
      scheduleSystemDomainsServerReadRetry(moduleId);
      renderSystemDomainsServerReadConsumer(moduleId);
      return { ok: false, error: systemDomainsServerReadState.error };
    }
    // A complete command rollout is still a compatibility phase until the
    // root-controlled PostgreSQL-primary marker is durable. Before that
    // point a differing browser snapshot remains safer than an incomplete
    // server projection; after it, an older snapshot must never mask PostgreSQL.
    const localSignature = systemDomainsState ? serializeSystemDomains(systemDomainsState) : "";
    const serverSignature = serializeSystemDomains(loaded.domains);
    if (!hasObservedSystemDomainsPrimaryAuthority() && localSignature && localSignature !== serverSignature) {
      systemDomainsServerReadState = { status: "fallback", error: "Server projection differs from compatibility snapshot", revision: Number(result.revision || 0) };
      scheduleSystemDomainsServerReadRetry(moduleId);
      renderSystemDomainsServerReadConsumer(moduleId);
      return { ok: false, error: systemDomainsServerReadState.error };
    }
    activateSystemDomains(loaded.domains, { source: "server-read", report: loaded.report });
    systemDomainsServerReadState = { status: "server", error: "", revision: Number(result.revision || 0) };
    // Retiring the shared snapshot is a root-controlled cutover command with
    // an exact proof and backup. The browser only observes that marker; it
    // never creates one merely because command surfaces became available.
    if (!hasObservedSystemDomainsPrimaryAuthority()) scheduleSystemDomainsServerReadRetry(moduleId);
    renderSystemDomainsServerReadConsumer(moduleId);
    return { ok: true, revision: systemDomainsServerReadState.revision };
  } catch {
    systemDomainsServerReadState = { status: "fallback", error: "System Domains read request failed", revision: 0 };
    if (canFallbackToLegacySystemDomains(fallbackToLegacy)) reloadSystemDomainsState({ source: "server-read-error", migrateLegacy: true });
    scheduleSystemDomainsServerReadRetry(moduleId);
    renderSystemDomainsServerReadConsumer(moduleId);
    return { ok: false, error: systemDomainsServerReadState.error };
  }
}
function ensurePlanningDomainApiModule() {
  if (workOrdersReadModel && planningRuntimeProjectionReadModel) return Promise.resolve(true);
  if (planningDomainApiModuleLoad) return planningDomainApiModuleLoad;
  planningDomainApiModuleLoad = Promise.all([
    import("./modules/domain_api/work_orders_read_model.js"),
    import("./modules/domain_api/planning_runtime_projection_read_model.js"),
  ]).then(([
    { createWorkOrdersReadModel },
    { canApplyPlanningRuntimeProjection: canApplyProjection, createPlanningRuntimeProjectionReadModel },
  ]) => {
    workOrdersReadModel = createWorkOrdersReadModel();
    planningRuntimeProjectionReadModel = createPlanningRuntimeProjectionReadModel();
    canApplyPlanningRuntimeProjection = canApplyProjection;
    return true;
  }).catch((error) => {
    planningDomainApiModuleLoad = null;
    planningRuntimeProjectionState = { status: "fallback", error: error?.message || "Planning domain API module is unavailable", revision: 0 };
    return false;
  });
  return planningDomainApiModuleLoad;
}
function getDomainWorkOrderProjections() { return workOrdersReadModel?.getItems?.() || []; }
function getDomainWorkOrderDetail(id) { return workOrdersReadModel?.getDetail?.(id) || null; }
function hydratePlanningWorkOrderReadModel() {
  void hydratePlanningWorkbenchBootstrap({ renderOnChange: true });
}
async function restorePlanningWorkbenchSnapshotFallback() {
  // During the initial Planning boot runtime_state owns the fallback request.
  // A later deferred-module navigation needs the same compatibility path, but
  // must not issue it repeatedly while a server incident persists.
  if (!sharedStateStatus.enabled || planningWorkbenchSnapshotFallbackState === "applied") return false;
  if (planningWorkbenchSnapshotFallbackPromise) return planningWorkbenchSnapshotFallbackPromise;
  const hydratePlanningSnapshotFallback = runtimeStateService?.hydratePlanningSnapshotFallback;
  if (typeof hydratePlanningSnapshotFallback !== "function") return false;
  planningWorkbenchSnapshotFallbackState = "loading";
  planningWorkbenchSnapshotFallbackPromise = Promise.resolve(hydratePlanningSnapshotFallback())
    .then((hydrated) => {
      if (!hydrated) return false;
      planningWorkbenchSnapshotFallbackState = "applied";
      return true;
    })
    .catch(() => false)
    .finally(() => {
      planningWorkbenchSnapshotFallbackPromise = null;
      if (planningWorkbenchSnapshotFallbackState === "loading") planningWorkbenchSnapshotFallbackState = "idle";
    });
  return planningWorkbenchSnapshotFallbackPromise;
}
async function hydratePlanningWorkbenchBootstrap({ force = false, renderOnChange = false } = {}) {
  if (!await ensurePlanningDomainApiModule()) return false;
  const requestedActiveRouteId = String(ui.activeRouteId || "");
  const result = await workOrdersReadModel.refreshWorkbenchBootstrap(requestedActiveRouteId, { force });
  if (!result.ok) {
    // Runtime fallback applies and renders the snapshot atomically. Rendering
    // once more here would create two complete Planning paints after an API
    // outage, precisely on the recovery path that must stay lightweight.
    await restorePlanningWorkbenchSnapshotFallback();
    return false;
  }
  planningWorkbenchSnapshotFallbackState = "idle";
  // A user can choose another order while a slow bootstrap is in flight.
  // Its response remains cached by the read model, but it must never restore
  // the earlier selection over the newer click.
  if (String(ui.activeRouteId || "") !== requestedActiveRouteId) return true;
  // The server canonicalizes a stale persisted selection to the first
  // available order. Keep that canonical ID in UI state so the next render
  // does not issue a second list/detail request for a removed route.
  const activeRouteId = String(result.activeId || result.items?.[0]?.id || "");
  const selectionChanged = ui.activeRouteId !== activeRouteId;
  if (selectionChanged) ui.activeRouteId = activeRouteId;
  // Returning to Planning deliberately clears the persisted selection before
  // its first paint. A warm PostgreSQL bootstrap can then answer from cache
  // with `changed: false`; the restored canonical selection still changes
  // React eligibility and therefore requires one final render.
  if (renderOnChange && (result.changed || selectionChanged) && ui.activeModule === "planning") render();
  return true;
}
async function hydrateInitialPlanningServerBootstrap() {
  // Gantt needs the complete route / operation / slot graph, while the
  // Planning workbench only needs its compact list and selected order.  Use
  // the existing PostgreSQL projection for a direct Gantt entry so the
  // shared-state service can retain its metadata-only handshake on success.
  // Returning false is intentional: runtime_state then restores exactly one
  // compatibility snapshot instead of presenting a partial graph.
  if (["gantt", "shiftMasterBoard", "shiftWorkOrders", "authSessionPrototype"].includes(ui?.activeModule)) {
    const applied = await hydratePlanningRuntimeProjection();
    // `applySharedStateSnapshot()` may synchronously render before runtime
    // state emits its post-sync completion hook.  Keep that intervening render
    // behind the loading gate: the required cold-boot fallback is already in
    // progress and must not start a second PostgreSQL read or snapshot fetch.
    ganttPlanningFallbackAwaitingInitialSharedSnapshot = !applied;
    return applied;
  }
  return hydratePlanningWorkbenchBootstrap();
}
async function hydratePlanningAfterSharedSync({ metadataOnly = true } = {}) {
  // A direct Gantt boot with a failed PostgreSQL projection has already made
  // runtime_state fetch the full compatibility snapshot.  A fast navigation
  // from a deferred module is different: its metadata-only sync contains no
  // graph, so promote the compatibility fallback only after metadata becomes
  // available.  In either case, never let Gantt render the pre-sync graph.
  if (ui?.activeModule === "gantt") {
    if (planningRuntimeProjectionState.status !== "fallback") return true;
    if (metadataOnly === false) {
      // runtime_state calls this hook only after it has atomically applied the
      // requested full Planning snapshot.  This is the explicit completion
      // proof for a direct Gantt boot; `valueProjection` alone changes before
      // an asynchronous fallback request finishes and is not safe to inspect.
      ganttPlanningFallbackReady = true;
      ganttPlanningFallbackAttempted = false;
      ganttPlanningFallbackAwaitingInitialSharedSnapshot = false;
      if (ui?.activeModule === "gantt") render({ skipRememberScroll: true });
      return true;
    }
    const fallbackApplied = await ensureGanttPlanningSnapshotFallback();
    if (fallbackApplied && ui?.activeModule === "gantt") render({ skipRememberScroll: true });
    return fallbackApplied;
  }
  return hydratePlanningWorkbenchBootstrap({ renderOnChange: true });
}
function noteGanttPlanningProjectionModuleEntry() {
  const ganttIsActive = ui?.activeModule === "gantt";
  const enteredGantt = ganttIsActive && !ganttPlanningModuleWasActive;
  ganttPlanningModuleWasActive = ganttIsActive;
  // A failed read is not a permanent client-state decision.  On the next
  // Gantt entry retry PostgreSQL, while retaining the known safe snapshot as
  // a fallback if the retry fails again.
  if (enteredGantt && ["server", "fallback"].includes(planningRuntimeProjectionState.status)) {
    planningRuntimeProjectionState = { status: "idle", error: "", revision: 0 };
    ganttPlanningFallbackReady = false;
    ganttPlanningFallbackAttempted = false;
    ganttPlanningFallbackAwaitingInitialSharedSnapshot = false;
  }
}
function hasGanttPlanningProjectionReady() {
  return planningRuntimeProjectionState.status === "server" || ganttPlanningFallbackReady;
}
async function ensureGanttPlanningSnapshotFallback() {
  if (ganttPlanningFallbackReady) return true;
  if (planningWorkbenchSnapshotFallbackState === "applied") {
    ganttPlanningFallbackReady = true;
    return true;
  }
  if (planningWorkbenchSnapshotFallbackPromise) {
    const restored = await planningWorkbenchSnapshotFallbackPromise;
    if (restored) ganttPlanningFallbackReady = true;
    return ganttPlanningFallbackReady;
  }
  if (ganttPlanningFallbackAwaitingInitialSharedSnapshot) return false;
  if (!sharedStateStatus.enabled || ganttPlanningFallbackAttempted) return false;
  ganttPlanningFallbackAttempted = true;
  const restored = await restorePlanningWorkbenchSnapshotFallback();
  if (restored) ganttPlanningFallbackReady = true;
  return ganttPlanningFallbackReady;
}
function ensureGanttPlanningRuntimeProjection() {
  // A non-initial navigation to Gantt happens after the generic shared-state
  // handshake. Start the full PostgreSQL projection once, before the lazy
  // Gantt renderer reaches the legacy collections.  Rendering is gated below
  // until this promise has either applied PostgreSQL data or completed the
  // explicit compatibility fallback.
  if (hasGanttPlanningProjectionReady()) return Promise.resolve(true);
  if (ganttPlanningProjectionGateLoad) return ganttPlanningProjectionGateLoad;
  ganttPlanningProjectionGateLoad = (async () => {
    if (planningRuntimeProjectionState.status === "fallback") {
      return ensureGanttPlanningSnapshotFallback();
    }
    const applied = await hydratePlanningRuntimeProjection();
    if (applied) return true;
    return ensureGanttPlanningSnapshotFallback();
  })().then((ready) => {
    // Successful PostgreSQL hydration already performs the one required
    // repaint.  Compatibility fallback has no renderer of its own, so it
    // needs this explicit completion render instead.
    if (ui?.activeModule === "gantt" && planningRuntimeProjectionState.status !== "server") {
      render({ skipRememberScroll: true });
    }
    return ready;
  }).finally(() => {
    ganttPlanningProjectionGateLoad = null;
  });
  return ganttPlanningProjectionGateLoad;
}
async function hydratePlanningRuntimeProjection({ force = false } = {}) {
  // Both the initial shared-state handshake and the first Gantt render can
  // request this projection in the same browser tick. They must share one
  // network request; otherwise a slow link spuriously activates the legacy
  // snapshot fallback while PostgreSQL is already returning the graph.
  if (force) planningRuntimeProjectionForceRefreshRequested = true;
  if (planningRuntimeProjectionLoad) return planningRuntimeProjectionLoad;
  planningRuntimeProjectionLoad = (async () => {
    let applied = false;
    do {
      const refreshForce = planningRuntimeProjectionForceRefreshRequested;
      planningRuntimeProjectionForceRefreshRequested = false;
      planningRuntimeProjectionState = { ...planningRuntimeProjectionState, status: "loading", error: "" };
      try {
        if (!await ensurePlanningDomainApiModule()) {
          planningRuntimeProjectionState = { status: "fallback", error: "Planning domain API module is unavailable", revision: 0 };
          applied = false;
          continue;
        }
        const result = await planningRuntimeProjectionReadModel.refresh({ force: refreshForce });
        if (!result.ok || !result.projection) {
          planningRuntimeProjectionState = { status: "fallback", error: result.error || "Planning runtime projection is unavailable", revision: 0 };
          applied = false;
          continue;
        }
        if (!canApplyPlanningRuntimeProjection(planningState, result.projection)) {
          planningRuntimeProjectionState = { status: "fallback", error: "Planning runtime projection differs from compatibility snapshot", revision: 0 };
          applied = false;
          continue;
        }
        // PostgreSQL data replaces only the in-memory planning collections. The
        // compatibility snapshot stays untouched until the next migration gate,
        // so an unsuccessful server read cannot erase local recovery data.
        planningState = {
          ...planningState,
          routes: result.projection.routes,
          routeSteps: result.projection.routeSteps,
          slots: result.projection.slots,
        };
        invalidateWeeklyPlanningPeriod();
        planningRuntimeProjectionState = { status: "server", error: "", revision: Number(result.projection.revision || 0) };
        ganttPlanningFallbackReady = false;
        ganttPlanningFallbackAttempted = false;
        ganttPlanningFallbackAwaitingInitialSharedSnapshot = false;
        applied = true;
      } catch {
        planningRuntimeProjectionState = { status: "fallback", error: "Planning runtime projection is unavailable", revision: 0 };
        applied = false;
      }
      // A write can complete while a previous read is still in flight.  A
      // forced caller must then observe one more PostgreSQL projection rather
      // than accepting the pre-command response it happened to join.
    } while (planningRuntimeProjectionForceRefreshRequested);
    if (applied && ["planning", "gantt", "shiftMasterBoard", "shiftWorkOrders", "authSessionPrototype"].includes(ui?.activeModule)) {
      render({ skipRememberScroll: true });
    }
    return applied;
  })().finally(() => {
    planningRuntimeProjectionLoad = null;
  });
  return planningRuntimeProjectionLoad;
}
function getShiftExecutionDispatchScope() {
  // Ask the loaded board for its actual current rows.  `slotRows` is only a
  // fallback inside that model; using it directly would miss rows generated
  // from work orders whenever both sources exist.
  if (typeof getShiftMasterBoardModel !== "function") return null;
  const model = getShiftMasterBoardModel();
  const dateKey = toDateInput(model?.window?.start || "");
  const sourceRowIds = [...new Set((model?.allRows || [])
    // Carryovers are returned by the date-scoped server query.  A synthetic
    // fallback has no durable source row and must stay client-only.
    .filter((row) => row && !row.isBoardCarryover && !row.isBoardFallback)
    .map((row) => String(row?.id || row?.sourceRowId || "").trim())
    .filter(Boolean))];
  const workCenterIds = [...new Set((model?.allRows || [])
    .filter((row) => row && !row.isBoardCarryover && !row.isBoardFallback)
    .map((row) => String(row?.workCenterId || row?.workCenter?.id || "").trim())
    .filter(Boolean))];
  if (!dateKey || !sourceRowIds.length || sourceRowIds.length > 200 || !workCenterIds.length || workCenterIds.length > 100) return null;
  return { dateKey, sourceRowIds: sourceRowIds.sort(), workCenterIds: workCenterIds.sort() };
}

function isSameShiftExecutionDispatchScope(left = null, right = null) {
  return Boolean(left && right)
    && left.dateKey === right.dateKey
    && left.sourceRowIds.length === right.sourceRowIds.length
    && left.sourceRowIds.every((value, index) => value === right.sourceRowIds[index])
    && left.workCenterIds.length === right.workCenterIds.length
    && left.workCenterIds.every((value, index) => value === right.workCenterIds[index]);
}

function isShiftExecutionServerAuthoritative() {
  return shiftExecutionServerState.status === "ready"
    && shiftExecutionServerState.commandsEnabled === true
    && shiftExecutionServerState.coverageComplete === true;
}

function isShiftExecutionDispatchScopeReadyForRow(row = {}) {
  const sourceRowId = String(row?.id || "").trim();
  const currentScope = getShiftExecutionDispatchScope();
  const state = shiftExecutionDispatchReadModel?.getState?.();
  return Boolean(
    sourceRowId
    && currentScope
    && state?.available
    && state.ok === true
    // A failed forced refresh intentionally keeps its last payload for the
    // read-only board, but that payload must never authorize a write.
    && !state.error
    && isSameShiftExecutionDispatchScope(currentScope, state.scope)
    && Array.isArray(state.coveredSourceRowIds)
    && state.coveredSourceRowIds.includes(sourceRowId),
  );
}

function getShiftExecutionServerAssignment(row = {}) {
  // A slot can span or be re-planned across board dates.  The compact server
  // reader is keyed by the durable row id, so a stale slot match must never
  // turn a new-shift create into an update of the previous-shift assignment.
  if (!isShiftExecutionDispatchScopeReadyForRow(row)) return null;
  return shiftExecutionDispatchReadModel.getBySourceRowId(row.id) || null;
}

function mergeShiftExecutionProjectionRecords(current = {}, incoming = {}, coveredSourceRowIds = [], { removeCovered = false } = {}) {
  const next = { ...normalizePlainRecord(current) };
  const covered = new Set(coveredSourceRowIds.map((id) => String(id || "").trim()).filter(Boolean));
  if (removeCovered && covered.size) {
    Object.entries(next).forEach(([key, value]) => {
      const sourceRowId = String(value?.sourceRowId || key || "").trim();
      if (covered.has(sourceRowId)) delete next[key];
    });
  }
  Object.entries(incoming || {}).forEach(([key, value]) => {
    next[key] = { ...(next[key] || {}), ...value };
  });
  return next;
}

function mergeShiftExecutionCarryovers(current = {}, incoming = {}, dateKey = "", { replaceDate = false } = {}) {
  if (typeof reconcileShiftMasterBoardCarryovers === "function") {
    return reconcileShiftMasterBoardCarryovers(current, incoming, { dateKey, replaceDate });
  }
  const next = { ...normalizePlainRecord(current) };
  if (replaceDate && dateKey) {
    Object.entries(next).forEach(([key, value]) => {
      if (String(value?.dateKey || "") === dateKey) delete next[key];
    });
  }
  Object.entries(incoming || {}).forEach(([key, value]) => {
    next[key] = { ...(next[key] || {}), ...value };
  });
  return next;
}

function applyShiftExecutionDispatchProjection(result = {}) {
  if (!ui || !projectShiftExecutionDispatchProjection) return false;
  const projection = projectShiftExecutionDispatchProjection(result);
  const coveredSourceRowIds = Array.isArray(result.coveredSourceRowIds) ? result.coveredSourceRowIds : [];
  const replaceCovered = result.coverageComplete === true;
  ui.shiftMasterBoardAssignments = mergeShiftExecutionProjectionRecords(
    ui.shiftMasterBoardAssignments,
    projection.assignments,
    coveredSourceRowIds,
    { removeCovered: replaceCovered },
  );
  ui.shiftMasterBoardFacts = mergeShiftExecutionProjectionRecords(
    ui.shiftMasterBoardFacts,
    projection.facts,
    coveredSourceRowIds,
    { removeCovered: replaceCovered },
  );
  const selectedCarryover = normalizePlainRecord(ui.shiftMasterBoardCarryovers)[ui.shiftMasterBoardSelectedSlotId] || null;
  ui.shiftMasterBoardCarryovers = mergeShiftExecutionCarryovers(
    ui.shiftMasterBoardCarryovers,
    projection.carryovers,
    String(result.scope?.dateKey || ""),
    { replaceDate: replaceCovered },
  );
  if (selectedCarryover && !ui.shiftMasterBoardCarryovers[ui.shiftMasterBoardSelectedSlotId]) {
    const canonicalSelection = Object.values(normalizePlainRecord(ui.shiftMasterBoardCarryovers)).find((carryover) => (
      carryover?.sourceRowId === selectedCarryover.sourceRowId
      && carryover?.dateKey === selectedCarryover.dateKey
    ));
    if (canonicalSelection?.id) ui.shiftMasterBoardSelectedSlotId = canonicalSelection.id;
  }
  return true;
}

function hydrateShiftExecutionServerProjection() {
  if (shiftExecutionServerState.status === "loading") return;
  const scope = getShiftExecutionDispatchScope();
  if (!scope) {
    // A synthetic/oversized board has no safe bounded query contract.  Keep
    // the compatibility snapshot active and never reuse command readiness
    // from the previously viewed real scope.
    shiftExecutionServerState = {
      ...shiftExecutionServerState,
      status: "idle",
      commandsEnabled: false,
      coverageComplete: false,
      error: "",
    };
    return;
  }
  const currentReadState = shiftExecutionDispatchReadModel?.getState?.();
  const scopeChanged = !isSameShiftExecutionDispatchScope(scope, currentReadState?.scope);
  if (shiftExecutionServerState.status === "ready"
    && currentReadState?.ok === true
    && !currentReadState.error
    && isSameShiftExecutionDispatchScope(scope, currentReadState.scope)
    && shiftExecutionServerState.coverageComplete === true) return;
  // Capture this before switching to loading. Otherwise every cached board
  // refresh looks like the first authority transition and persists the full
  // shared UI snapshot again, even though no server data has changed.
  const wasAuthoritative = isShiftExecutionServerAuthoritative();
  // Do not accept a write while the active read-model entry still describes a
  // previous date.  Existing snapshot data remains editable/persisted; the
  // server mirror resumes after the exact current scope is ready.
  shiftExecutionServerState = {
    ...shiftExecutionServerState,
    status: "loading",
    commandsEnabled: false,
    coverageComplete: false,
    error: "",
  };
  void ensureShiftExecutionDomainApiModule().then((ready) => ready
    ? Promise.all([shiftExecutionDispatchReadModel.refresh(scope), shiftExecutionCommands.refreshCapability()])
    : [{ ok: false, items: [] }, { ok: false, primaryPostgres: false, schemaReady: false, enabled: false, error: "Shift execution domain API module is unavailable" }]
  ).then(([projection, capability]) => {
    // Date navigation may finish while the previous request is in flight.
    // Never merge an older shift into the newly selected board.
    if (!isSameShiftExecutionDispatchScope(scope, getShiftExecutionDispatchScope())) {
      shiftExecutionServerState = { ...shiftExecutionServerState, status: "idle", error: "" };
      if (ui?.activeModule === "shiftMasterBoard") hydrateShiftExecutionServerProjection();
      return;
    }
    const projectionReady = projection.ok === true;
    const capabilityReady = capability.ok === true;
    const coverageComplete = projectionReady && projection.coverageComplete === true;
    const commandsEnabled = projectionReady && capabilityReady && capability.enabled === true;
    shiftExecutionServerState = {
      status: projectionReady && capabilityReady ? "ready" : "fallback",
      primaryPostgres: capability.primaryPostgres === true,
      schemaReady: capability.schemaReady === true,
      commandsEnabled,
      coverageComplete,
      // The bounded dispatch read is an overlay during migration. It cannot
      // retire compatibility state until a later full parity gate proves that
      // the server covers every board record.
      error: projectionReady && capabilityReady ? "" : (projection.error || capability.error || "Shift execution server projection is unavailable"),
    };
    if (projectionReady && commandsEnabled) {
      applyShiftExecutionDispatchProjection(projection);
      if (coverageComplete && !wasAuthoritative) persistUiState();
      void flushShiftExecutionOutbox();
    }
    if (ui?.activeModule === "shiftWorkOrders" && projection.ok) {
      window.setTimeout(() => {
        if (ui?.activeModule === "shiftWorkOrders") render({ skipRememberScroll: true });
      }, 0);
    } else if (projection.ok && (projection.changed || scopeChanged) && ["shiftMasterBoard", "authSessionPrototype"].includes(ui?.activeModule)) {
      render({ skipRememberScroll: true });
    }
  }).catch(() => {
    shiftExecutionServerState = {
      ...shiftExecutionServerState,
      status: "fallback",
      commandsEnabled: false,
      coverageComplete: false,
      error: "Shift execution server projection is unavailable",
    };
  });
}
function ensureShiftExecutionDomainApiModule() {
  if (shiftExecutionDispatchReadModel && shiftExecutionCommands && shiftExecutionOutbox) return Promise.resolve(true);
  if (shiftExecutionDomainApiModuleLoad) return shiftExecutionDomainApiModuleLoad;
  shiftExecutionDomainApiModuleLoad = Promise.all([
    import("./modules/domain_api/shift_execution_dispatch_read_model.js"),
    import("./modules/domain_api/shift_execution_commands.js"),
    import("./modules/shift_master_board/server_execution_bridge.js"),
    import("./modules/shift_master_board/server_projection_adapter.js"),
    import("./modules/shift_master_board/carryover_reconciliation.js"),
    import("./modules/shift_master_board/server_execution_outbox.js"),
  ]).then(([
    { createShiftExecutionDispatchReadModel },
    { createShiftExecutionCommands },
    bridge,
    { projectShiftExecutionDispatchProjection: projectProjection },
    { reconcileShiftMasterBoardCarryovers: reconcileCarryovers },
    { createShiftExecutionOutbox },
  ]) => {
    shiftExecutionDispatchReadModel = createShiftExecutionDispatchReadModel();
    shiftExecutionCommands = createShiftExecutionCommands();
    shiftExecutionOutbox = createShiftExecutionOutbox();
    ({
      buildShiftMasterBoardAssignmentWrite,
      buildShiftMasterBoardFactWrite,
      buildShiftMasterBoardCarryoverWrite,
      buildShiftMasterBoardCarryoverCancelWrite,
      executeShiftMasterBoardServerWrite,
    } = bridge);
    projectShiftExecutionDispatchProjection = projectProjection;
    reconcileShiftMasterBoardCarryovers = reconcileCarryovers;
    return true;
  }).catch((error) => {
    shiftExecutionDomainApiModuleLoad = null;
    shiftExecutionServerState = {
      ...shiftExecutionServerState,
      status: "fallback",
      commandsEnabled: false,
      coverageComplete: false,
      error: error?.message || "Shift execution domain API module is unavailable",
    };
    return false;
  });
  return shiftExecutionDomainApiModuleLoad;
}
async function refreshShiftExecutionServerProjection() {
  if (!await ensureShiftExecutionDomainApiModule()) {
    const error = "Shift execution domain API module is unavailable";
    shiftExecutionServerState = {
      ...shiftExecutionServerState,
      status: "fallback",
      commandsEnabled: false,
      coverageComplete: false,
      error,
    };
    return { ok: false, error };
  }
  const scope = getShiftExecutionDispatchScope();
  if (!scope) {
    const error = "Current shift dispatch scope is unavailable";
    shiftExecutionServerState = {
      ...shiftExecutionServerState,
      status: "idle",
      commandsEnabled: false,
      coverageComplete: false,
      error,
    };
    return { ok: false, error };
  }
  const result = await shiftExecutionDispatchReadModel.refresh({ ...scope, force: true });
  if (!result.ok) {
    shiftExecutionServerState = {
      ...shiftExecutionServerState,
      status: "fallback",
      commandsEnabled: false,
      coverageComplete: false,
      error: result.error || "Shift execution server projection is unavailable",
    };
    return result;
  }
  if (!isSameShiftExecutionDispatchScope(scope, getShiftExecutionDispatchScope())) {
    shiftExecutionServerState = {
      ...shiftExecutionServerState,
      status: "idle",
      commandsEnabled: false,
      coverageComplete: false,
      error: "",
    };
    return { ...result, changed: false };
  }
  applyShiftExecutionDispatchProjection(result);
  shiftExecutionServerState = { ...shiftExecutionServerState, status: "ready", coverageComplete: result.coverageComplete === true, error: "" };
  return result;
}
async function flushShiftExecutionOutbox() {
  if (!shiftExecutionServerState.commandsEnabled || shiftExecutionOutboxFlushInFlight) return { attempted: 0, delivered: 0, pending: shiftExecutionOutbox?.getPending?.().length || 0 };
  if (!await ensureShiftExecutionDomainApiModule()) return { attempted: 0, delivered: 0, pending: 0 };
  shiftExecutionOutboxFlushInFlight = true;
  try {
    const result = await shiftExecutionOutbox.flush(async (write) => executeShiftMasterBoardServerWrite(shiftExecutionCommands, write));
    if (result.delivered > 0 || result.conflicts > 0) await refreshShiftExecutionServerProjection();
    return result;
  } finally {
    shiftExecutionOutboxFlushInFlight = false;
  }
}
async function mirrorShiftMasterBoardAssignmentToServer(row, assignment) {
  if (!shiftExecutionServerState.commandsEnabled || !isShiftExecutionDispatchScopeReadyForRow(row) || !assignment) return { skipped: true };
  if (!await ensureShiftExecutionDomainApiModule()) return { ok: false, error: "Shift execution domain API module is unavailable" };
  let write = null;
  try {
    const serverAssignment = getShiftExecutionServerAssignment(row);
    write = buildShiftMasterBoardAssignmentWrite(row, assignment, serverAssignment);
    const result = await executeShiftMasterBoardServerWrite(shiftExecutionCommands, write);
    if (result?.conflict) {
      await refreshShiftExecutionServerProjection();
      return result;
    }
    if (!result?.ok) throw new Error(result?.error || "Shift assignment was not accepted by the server");
    await refreshShiftExecutionServerProjection();
    return result;
  } catch (error) {
    if (write) shiftExecutionOutbox.enqueue(write, error?.message || "Shift assignment server mirror failed");
    shiftExecutionServerState = { ...shiftExecutionServerState, status: "fallback", error: error?.message || "Shift assignment server mirror failed" };
    return { ok: false, error: shiftExecutionServerState.error };
  }
}
async function mirrorShiftMasterBoardFactToServer(row, fact) {
  if (!shiftExecutionServerState.commandsEnabled || !isShiftExecutionDispatchScopeReadyForRow(row) || !fact) return { skipped: true };
  if (!await ensureShiftExecutionDomainApiModule()) return { ok: false, error: "Shift execution domain API module is unavailable" };
  let write = null;
  try {
    const serverAssignment = getShiftExecutionServerAssignment(row);
    write = buildShiftMasterBoardFactWrite(row, fact, serverAssignment);
    const result = await executeShiftMasterBoardServerWrite(shiftExecutionCommands, write);
    if (!result?.ok) throw new Error(result?.error || "Shift fact was not accepted by the server");
    await refreshShiftExecutionServerProjection();
    return result;
  } catch (error) {
    if (write) shiftExecutionOutbox.enqueue(write, error?.message || "Shift fact server mirror failed");
    shiftExecutionServerState = { ...shiftExecutionServerState, status: "fallback", error: error?.message || "Shift fact server mirror failed" };
    return { ok: false, error: shiftExecutionServerState.error };
  }
}
async function mirrorShiftMasterBoardCarryoverToServer(row, carryover, replacedCarryover = null) {
  if (!shiftExecutionServerState.commandsEnabled || !isShiftExecutionDispatchScopeReadyForRow(row) || !carryover) return { skipped: true };
  if (!await ensureShiftExecutionDomainApiModule()) return { ok: false, error: "Shift execution domain API module is unavailable" };
  let write = null;
  try {
    const serverAssignment = getShiftExecutionServerAssignment(row);
    // A corrected partial fact must first cancel the active canonical
    // carryover. The server enforces the logical (source assignment, date)
    // key, so creating before this transition would be a deterministic
    // conflict rather than a second active remainder.
    if (replacedCarryover?.serverId) {
      const cancellation = await mirrorShiftMasterBoardCarryoverRemovalToServer(row, replacedCarryover, {
        reason: "Остаток пересчитан после корректировки факта",
      });
      if (!cancellation?.ok) {
        write = buildShiftMasterBoardCarryoverWrite(carryover, serverAssignment);
        if (write) shiftExecutionOutbox.enqueue(write, cancellation?.error || "Waiting for shift carryover cancellation");
        return cancellation;
      }
    }
    write = buildShiftMasterBoardCarryoverWrite(carryover, serverAssignment);
    const result = await executeShiftMasterBoardServerWrite(shiftExecutionCommands, write);
    if (result?.conflict) {
      await refreshShiftExecutionServerProjection();
      return result;
    }
    if (!result?.ok) throw new Error(result?.error || "Shift carryover was not accepted by the server");
    const serverItem = normalizePlainRecord(result.item);
    const canonicalId = String(serverItem.id || "").trim();
    if (canonicalId) {
      const selectedCarryoverId = ui.shiftMasterBoardSelectedSlotId;
      const canonicalCarryover = {
        ...carryover,
        id: canonicalId,
        serverId: canonicalId,
        sourceRowId: carryover.sourceRowId || row.id || "",
        sourceSlotId: serverItem.sourceSlotId || serverItem.source_slot_id || carryover.sourceSlotId || "",
        routeId: serverItem.workOrderId || serverItem.work_order_id || carryover.routeId || "",
        stepId: serverItem.operationId || serverItem.work_order_operation_id || carryover.stepId || "",
        workCenterId: serverItem.workCenterId || serverItem.work_center_id || carryover.workCenterId || "",
        dateKey: String(serverItem.dateKey || serverItem.date_key || carryover.dateKey || "").slice(0, 10),
        remainingQuantity: Number(serverItem.remainingQuantity ?? serverItem.remaining_quantity ?? carryover.remainingQuantity ?? 0),
        reason: String(serverItem.reason || carryover.reason || ""),
        createdAt: String(serverItem.createdAt || serverItem.created_at || carryover.createdAt || ""),
      };
      ui.shiftMasterBoardCarryovers = mergeShiftExecutionCarryovers(
        ui.shiftMasterBoardCarryovers,
        { [canonicalId]: canonicalCarryover },
      );
      if (selectedCarryoverId === carryover.id) ui.shiftMasterBoardSelectedSlotId = canonicalId;
      persistUiState();
    }
    await refreshShiftExecutionServerProjection();
    return result;
  } catch (error) {
    if (write) shiftExecutionOutbox.enqueue(write, error?.message || "Shift carryover server mirror failed");
    shiftExecutionServerState = { ...shiftExecutionServerState, status: "fallback", error: error?.message || "Shift carryover server mirror failed" };
    return { ok: false, error: shiftExecutionServerState.error };
  }
}
async function mirrorShiftMasterBoardCarryoverRemovalToServer(row, carryover, { reason = "" } = {}) {
  if (!carryover?.serverId) return { skipped: true };
  if (!shiftExecutionServerState.commandsEnabled || !isShiftExecutionDispatchScopeReadyForRow(row)) return { skipped: true };
  if (!await ensureShiftExecutionDomainApiModule()) return { ok: false, error: "Shift execution domain API module is unavailable" };
  let write = null;
  try {
    write = buildShiftMasterBoardCarryoverCancelWrite(carryover, { reason });
    const result = await executeShiftMasterBoardServerWrite(shiftExecutionCommands, write);
    if (!result?.ok) throw new Error(result?.error || "Shift carryover cancellation was not accepted by the server");
    await refreshShiftExecutionServerProjection();
    return result;
  } catch (error) {
    if (write) shiftExecutionOutbox.enqueue(write, error?.message || "Shift carryover cancellation mirror failed");
    shiftExecutionServerState = { ...shiftExecutionServerState, status: "fallback", error: error?.message || "Shift carryover cancellation mirror failed" };
    return { ok: false, error: shiftExecutionServerState.error };
  }
}
async function changePlanningRouteQuantity(routeId, quantity, options = {}) {
  if (!await ensurePlanningDomainApiModule()) return options.requireServerCommand ? false : syncPlanningRouteQuantity(routeId, quantity, options);
  const route = (planningState?.routes || []).find((item) => item.id === routeId);
  const projected = workOrdersReadModel.getItems().find((item) => String(item.id) === String(routeId));
  const expectedRevision = Number(projected?.concurrencyRevision ?? route?.domainConcurrencyRevision);
  if ((!route && options.requireServerCommand !== true) || !Number.isInteger(expectedRevision)) {
    return options.requireServerCommand ? false : syncPlanningRouteQuantity(routeId, quantity, options);
  }
  const result = await workOrdersReadModel.changeQuantity(routeId, quantity, expectedRevision);
  if (result.ok) {
    // Pull the authoritative slot projection after the command. This is cheap
    // (one order) and prevents the workbench from showing a client-side
    // duration while PostgreSQL has already calculated a calendar-aware one.
    const [, serverProjectionApplied] = await Promise.all([
      workOrdersReadModel.refreshDetail(routeId, { force: true }),
      hydratePlanningRuntimeProjection({ force: true }),
    ]);
    if (serverProjectionApplied) return true;
    if (options.requireServerCommand === true) {
      invalidateWeeklyPlanningPeriod();
      return true;
    }
    const fallbackApplied = syncPlanningRouteQuantity(routeId, quantity, {
      ...options,
      domainConcurrencyRevision: result.item.concurrencyRevision,
      // PostgreSQL has already committed the command and the API outbox
      // mirrors the authoritative projection into shared state. Recalculate
      // only the open screen here; a second browser write could overwrite the
      // server-calculated duration or race with the outbox.
      persist: false,
    });
    // This fallback intentionally avoids a competing browser write, so it
    // cannot rely on persistState() to invalidate the compact Weekly view.
    if (fallbackApplied) invalidateWeeklyPlanningPeriod();
    return fallbackApplied;
  }
  if (result.kind === "unavailable") {
    return options.requireServerCommand ? false : syncPlanningRouteQuantity(routeId, quantity, options);
  }
  if (result.kind === "conflict") {
    await Promise.all([
      workOrdersReadModel.refresh({ force: true }),
      workOrdersReadModel.refreshDetail(routeId, { force: true }),
    ]);
    notifySaveSuccess("Количество уже изменено в другом сеансе. Экран обновлён.");
    if (options.renderOnConflict !== false) render();
  }
  return false;
}
async function changePlanningSlotSchedule(routeId, operationId, plannedStart, options = {}) {
  if (!await ensurePlanningDomainApiModule()) return { applied: false, kind: "local" };
  const route = (planningState?.routes || []).find((item) => item.id === routeId);
  const projected = workOrdersReadModel.getItems().find((item) => String(item.id) === String(routeId));
  const expectedRevision = Number(projected?.concurrencyRevision ?? route?.domainConcurrencyRevision);
  if (!route || !String(operationId || "") || !Number.isInteger(expectedRevision)) return { applied: false, kind: "local" };
  const result = await workOrdersReadModel.changeSlotSchedule(routeId, operationId, plannedStart, expectedRevision);
  if (result.ok) {
    const [detailResult, serverProjectionApplied] = await Promise.all([
      workOrdersReadModel.refreshDetail(routeId, { force: true }),
      hydratePlanningRuntimeProjection({ force: true }),
    ]);
    const authoritativeSlot = detailResult.item?.operations?.find((operation) => String(operation.id) === String(operationId))?.slot;
    if (!authoritativeSlot?.id) return { applied: false, kind: "unavailable" };
    if (serverProjectionApplied) return { applied: true, slot: authoritativeSlot };
    planningState.routes = planningState.routes.map((item) => item.id === routeId
      ? { ...item, domainConcurrencyRevision: result.item.concurrencyRevision, updatedAt: result.item.updatedAt || item.updatedAt }
      : item);
    planningState.slots = planningState.slots.map((slot) => String(slot.id) === String(authoritativeSlot.id)
      ? { ...slot, plannedStart: authoritativeSlot.plannedStart, plannedEnd: authoritativeSlot.plannedEnd, updatedAt: result.item.updatedAt || slot.updatedAt }
      : slot);
    invalidateWeeklyPlanningPeriod();
    return { applied: true, slot: authoritativeSlot };
  }
  if (result.kind === "conflict") {
    await Promise.all([workOrdersReadModel.refresh({ force: true }), workOrdersReadModel.refreshDetail(routeId, { force: true })]);
    notifySaveSuccess("Срок уже изменён в другом сеансе. Экран обновлён.");
    if (options.renderOnConflict !== false) render();
  }
  return { applied: false, kind: result.kind || "unavailable" };
}
let planningCoreService = {};
let operationalRuntimeService = {};
let systemDomainsState = null;
let systemDomainsMigrationReport = null;
let systemDomainsAccessControlService = null;
let systemDomainsLastReloadSource = "";
let saveFeedbackTimer = null;
let saveUxRefreshTimer = null;
let pendingSaveFeedback = null;
let authPrototypePinDraft = "";
let authPrototypePinFeedbackTimer = null;
let authPrototypePinFeedbackSequence = 0;
let authPrototypeKeypadDigits = [];
let focusFullscreenRestoreAttempted = false;
let bundledBootstrapSnapshot = null;
let bootstrapSnapshotLoadStarted = false;
let bootstrapSnapshotLoadPromise = null;
let legacyProductionStructure = null;
let legacyProductionStructureLoad = null;
let legacyProductionStructureError = null;

function getLegacyProductionStructure() {
  return legacyProductionStructure;
}

function getLegacyProductionStructureWorkCenters(overrides = {}) {
  const service = getLegacyProductionStructure();
  if (service) return service.getProductionStructureWorkCenters(overrides);
  return DEFAULT_PRODUCTION_WORK_CENTERS.map((workCenter) => ({ ...workCenter }));
}

function getLegacyProductionStructureResources(overrides = {}) {
  const service = getLegacyProductionStructure();
  return service ? service.getProductionStructureResources(overrides) : [];
}

function getLegacyProductionStructureEmployees(overrides = {}) {
  const service = getLegacyProductionStructure();
  return service ? service.getProductionStructureEmployees(overrides) : [];
}

function getLegacyProductionStructureMasterProfiles(overrides = {}) {
  const service = getLegacyProductionStructure();
  return service ? service.getProductionStructureMasterProfiles(overrides) : [];
}

function getLegacyProductionStructureExecutorRows(overrides = {}) {
  const service = getLegacyProductionStructure();
  return service ? service.getProductionStructureExecutorRows(overrides) : [];
}

function getLegacyProductionStructureSummary(overrides = {}) {
  const service = getLegacyProductionStructure();
  return service ? service.getProductionStructureSummary(overrides) : {
    rows: 0,
    fields: 0,
    departments: 0,
    sections: 0,
    roles: 0,
    employees: 0,
    equipment: 0,
  };
}

function ensureLegacyProductionStructure() {
  if (legacyProductionStructure) return Promise.resolve(legacyProductionStructure);
  if (legacyProductionStructureError) return Promise.reject(legacyProductionStructureError);
  if (!legacyProductionStructureLoad) {
    legacyProductionStructureLoad = Promise.all([
      import("./production_structure_service.js"),
      import("./production_structure_bootstrap_data.js"),
    ]).then(([service, bootstrap]) => {
      legacyProductionStructure = {
        ...service,
        bootstrapRows: bootstrap.PRODUCTION_STRUCTURE_BOOTSTRAP_ROWS,
      };
      return legacyProductionStructure;
    }).catch((error) => {
      legacyProductionStructureError = error;
      throw error;
    });
  }
  return legacyProductionStructureLoad;
}

function getSystemDomainsRegistries() {
  return systemDomainsState?.registries && typeof systemDomainsState.registries === "object"
    ? systemDomainsState.registries
    : {};
}

function hasActivatableSystemDomains(domains, report = {}) {
  const registries = domains?.registries || {};
  return report.valid !== false
    && Array.isArray(registries.employees)
    && registries.employees.length > 0
    && Array.isArray(registries.accessRoles)
    && registries.accessRoles.length > 0
    && Array.isArray(registries.grants)
    && registries.grants.length > 0
    && Array.isArray(registries.roleAssignments)
    && registries.roleAssignments.length > 0;
}

function getLegacyAccessRoleAssignmentsForMigration() {
  const explicit = normalizeAccessRoleAssignments(ui?.accessRoleAssignments);
  const inferred = Object.fromEntries(getLegacyProductionStructureEmployees(
    ui?.productionStructureMatrixOverrides || {},
  ).flatMap((employee) => {
    const roleId = getAccessRoleForEmployee(employee)?.role?.id || "";
    return employee?.id && roleId ? [[employee.id, roleId]] : [];
  }));
  return { ...inferred, ...explicit };
}

function migrateCurrentLegacySystemDomains() {
  const legacy = getLegacyProductionStructure();
  if (!legacy) return null;
  return migrateLegacySystemDomains({
    matrixRows: legacy.bootstrapRows,
    matrixOverrides: ui?.productionStructureMatrixOverrides || {},
    legacyUi: {
      productionStructureMatrixOverrides: ui?.productionStructureMatrixOverrides || {},
      timesheetScheduleOverrides: ui?.timesheetScheduleOverrides || {},
      timesheetCellOverrides: ui?.timesheetCellOverrides || {},
      accessRoleProfiles: ui?.accessRoleProfiles || [],
      accessRoleAssignments: getLegacyAccessRoleAssignmentsForMigration(),
      shiftMasterAssignmentMatrix: ui?.shiftMasterAssignmentMatrix || {},
    },
    defaultAccessRoleProfiles: getDefaultAccessRoleProfiles(),
    migratedAt: new Date().toISOString(),
  });
}

function projectSystemDomainsAccessProfiles() {
  const roleById = new Map(toAccessControlRoles(systemDomainsState).map((role) => [role.id, role]));
  const defaults = typeof getDefaultAccessRoleProfiles === "function" ? getDefaultAccessRoleProfiles() : [];
  return defaults.map((fallback) => {
    const role = roleById.get(fallback.id);
    if (!role) return fallback;
    return {
      ...fallback,
      label: role.label || fallback.label,
      caption: role.description || fallback.caption,
      scope: role.scope || fallback.scope,
      defaultModule: role.defaultModule || fallback.defaultModule,
      modulePermissions: role.grants,
    };
  });
}

function mirrorSystemDomainsToCompatibilityState() {
  if (!ui || !systemDomainsState) return;
  ui.accessRoleProfiles = projectSystemDomainsAccessProfiles();
  ui.accessRoleAssignments = Object.fromEntries(
    (getSystemDomainsRegistries().roleAssignments || []).flatMap((assignment) => (
      assignment?.employeeId && assignment?.roleId ? [[assignment.employeeId, assignment.roleId]] : []
    )),
  );
  ui.shiftMasterAssignmentMatrix = Object.fromEntries(
    (getSystemDomainsRegistries().responsibilityPolicies || []).flatMap((policy) => (
      policy?.subjectEmployeeId && policy?.isActive !== false
        ? [[policy.subjectEmployeeId, {
          mode: policy.mode || "department",
          employeeIds: Array.isArray(policy.targetEmployeeIds) ? [...policy.targetEmployeeIds] : [],
          updatedAt: policy.updatedAt || "",
        }]]
        : []
    )),
  );
}

function rebuildSystemDomainsAccessControlService() {
  if (!systemDomainsState) {
    systemDomainsAccessControlService = null;
    return;
  }
  systemDomainsAccessControlService = createAccessControlService({
    accessRoles: toAccessControlRoles(systemDomainsState),
    subjectRoleAssignments: toAccessControlAssignments(systemDomainsState),
  });
}

function persistSystemDomainsState({ push = true, reason = "system-domains" } = {}) {
  if (!systemDomainsState) return false;
  if (hasObservedSystemDomainsPrimaryAuthority() && !hasSystemDomainsServerAuthority()) {
    // PostgreSQL is known to be primary but its current readiness proof is
    // unhealthy. Never recreate a compatibility snapshot from this browser.
    console.warn("System Domains PostgreSQL-primary proof is unavailable; local compatibility write is blocked");
    return false;
  }
  try {
    window.localStorage.setItem(SYSTEM_DOMAINS_STORAGE_KEY, serializeSystemDomains(systemDomainsState));
    if (push && typeof scheduleSharedStatePush === "function") scheduleSharedStatePush(reason);
    return true;
  } catch (error) {
    console.error("Не удалось сохранить System Domains", error);
    return false;
  }
}

function commitSystemDomainsCandidate(candidate, {
  source = "mutation",
  reason = "system-domains",
  push = true,
  serverCommand = false,
  surface = "",
} = {}) {
  const canUseServerCommand = serverCommand
    && systemDomainsServerCommandState.enabled === true
    && systemDomainsServerCommandState.surfaces.includes(surface);
  if (!canUseServerCommand) {
    if (hasObservedSystemDomainsPrimaryAuthority()) {
      systemDomainsServerReadState = {
        status: "fallback",
        error: "System Domains PostgreSQL-primary command path is temporarily unavailable",
        revision: systemDomainsServerReadState.revision,
      };
      console.warn("System Domains PostgreSQL-primary command path is unavailable; local mutation is blocked");
      notifySaveSuccess("Системные данные обновляются. Повторите действие через несколько секунд.");
      void hydrateSystemDomainsServerRead("", { fallbackToLegacy: false, force: true });
      return false;
    }
    activateSystemDomains(candidate, { source });
    return persistSystemDomainsState({ push, reason });
  }
  return (async () => {
    // A form is allowed to write to PostgreSQL only when its compatibility
    // snapshot is exactly the projection that the command will replace. This
    // protects still-unmigrated forms from being silently overwritten.
    const current = await systemDomainsReadModel.refresh({ force: true });
    if (!current.ok || !current.item || !Number.isInteger(Number(current.revision)) || Number(current.revision) < 1) {
      throw new Error(current.error || "Не удалось проверить актуальную ревизию System Domains");
    }
    const currentLoaded = loadSystemDomains(current.item);
    if (!hasActivatableSystemDomains(currentLoaded.domains, currentLoaded.report)
      || serializeSystemDomains(systemDomainsState) !== serializeSystemDomains(currentLoaded.domains)) {
      systemDomainsServerReadState = { status: "fallback", error: "Server projection differs from compatibility snapshot", revision: Number(current.revision || 0) };
      throw new Error("Данные изменились в другом контуре. Обновите страницу перед сохранением.");
    }
    const result = await systemDomainsCommands.replace(candidate, { expectedRevision: Number(current.revision), surface });
    if (!result.ok || !result.item) {
      const error = new Error(result.error || "Сервер не принял изменение System Domains");
      error.conflict = result.conflict === true;
      throw error;
    }
    const authoritative = loadSystemDomains(result.item);
    if (!hasActivatableSystemDomains(authoritative.domains, authoritative.report)) {
      throw new Error("Сервер вернул непригодную проекцию System Domains");
    }
    activateSystemDomains(authoritative.domains, { source: `${source}:server-command`, report: authoritative.report });
    systemDomainsServerReadState = { status: "server", error: "", revision: Number(result.revision || 0) };
    // The command synchronizes the compatible snapshot through its server
    // outbox. Keep this tab responsive without scheduling a competing browser
    // snapshot push.
    persistSystemDomainsState({ push: false, reason });
    return true;
  })();
}

function activateSystemDomains(domains, { source = "runtime", persist = false, push = false, report = null } = {}) {
  systemDomainsState = normalizeSystemDomains(domains);
  systemDomainsMigrationReport = report || systemDomainsMigrationReport;
  systemDomainsLastReloadSource = source;
  mirrorSystemDomainsToCompatibilityState();
  rebuildSystemDomainsAccessControlService();
  if (persist) persistSystemDomainsState({ push });
  return systemDomainsState;
}

function reloadSystemDomainsState({ source = "runtime", migrateLegacy = true } = {}) {
  // Once PostgreSQL has become the primary authority, a delayed legacy
  // bootstrap must never re-hydrate or re-persist the browser snapshot. This
  // guard is intentionally before the localStorage read: the durable
  // tombstone may have arrived while ensureLegacyProductionStructure() was
  // still resolving.
  if (hasObservedSystemDomainsPrimaryAuthority()) return systemDomainsState;
  const raw = window.localStorage.getItem(SYSTEM_DOMAINS_STORAGE_KEY);
  if (raw) {
    const loaded = loadSystemDomains(raw);
    if (hasActivatableSystemDomains(loaded.domains, loaded.report)) {
      return activateSystemDomains(loaded.domains, { source, report: loaded.report });
    }
  }
  if (!migrateLegacy) return systemDomainsState;
  if (!getLegacyProductionStructure()) {
    void ensureLegacyProductionStructure().then(() => {
      // A blank browser has no stored domains yet.  Finish its legacy import
      // asynchronously instead of putting the complete matrix on every first
      // paint. Existing users with System Domains never take this branch.
      // A primary-authority tombstone can arrive while the lazy legacy matrix
      // is loading. Re-check at the async boundary before it can activate the
      // compatibility state or schedule a browser snapshot push.
      if (hasObservedSystemDomainsPrimaryAuthority()) return;
      reloadSystemDomainsState({ source: `${source}:legacy-ready`, migrateLegacy: true });
      render();
    }).catch((error) => {
      console.error("Не удалось загрузить матрицу структуры для миграции", error);
    });
    return systemDomainsState;
  }
  const migration = migrateCurrentLegacySystemDomains();
  if (!migration.report.canActivate || !hasActivatableSystemDomains(migration.domains, migration.report.validation)) {
    console.error("System Domains migration blocked", migration.report);
    return systemDomainsState;
  }
  return activateSystemDomains(migration.domains, {
    source: `${source}:legacy-migration`,
    persist: true,
    push: true,
    report: migration.report,
  });
}

function updateSystemDomainRegistry(registryName, updater, { push = true, mutationKeys = [], source = "", serverCommand = false, surface = "" } = {}) {
  if (!systemDomainsState || !Array.isArray(getSystemDomainsRegistries()[registryName])) return false;
  const current = getSystemDomainsRegistries()[registryName].map((entity) => ({ ...entity }));
  const next = typeof updater === "function" ? updater(current) : current;
  if (!Array.isArray(next)) return false;
  const candidate = normalizeSystemDomains({
    ...systemDomainsState,
    metadata: {
      ...(systemDomainsState.metadata || {}),
      updatedAt: new Date().toISOString(),
      lastMutationRegistry: registryName,
      lastMutationKeys: [...new Set((mutationKeys || []).map((key) => String(key || "").trim()).filter(Boolean))],
    },
    registries: {
      ...getSystemDomainsRegistries(),
      [registryName]: next,
    },
  });
  const validation = validateSystemDomains(candidate);
  if (!validation.valid) {
    console.error(`System Domains mutation rejected for ${registryName}`, validation);
    return false;
  }
  return commitSystemDomainsCandidate(candidate, {
    source: source || `mutation:${registryName}`,
    push,
    reason: `system-domains:${registryName}`,
    serverCommand,
    surface,
  });
}

function getSystemDomainsState() {
  return systemDomainsState;
}

function getSystemDomainsMigrationReport() {
  let migrationReport = systemDomainsMigrationReport || {};
  try {
    migrationReport = migrateCurrentLegacySystemDomains()?.report || migrationReport;
  } catch {
    // The caller also receives current validation below. A diagnostics report
    // must never make the operational registries unavailable.
  }
  const validation = systemDomainsState ? validateSystemDomains(systemDomainsState) : { valid: false, errors: [{ code: "not-loaded" }] };
  return {
    ...migrationReport,
    canActivate: migrationReport.canActivate === true && validation.valid === true,
    lastReloadSource: systemDomainsLastReloadSource,
    validation,
  };
}

function canEditSystemDomainRegistry(registryName = "") {
  if (!systemDomainsState || !String(registryName || "").trim()) return false;
  const service = getAccessControlService();
  const subject = getAccessControlSubject();
  return Boolean(service?.can(subject, "productionStructureMatrix", "edit", {}));
}

function upsertSystemDomainEntity(registryName = "", entity = {}, options = {}) {
  const normalizedRegistryName = String(registryName || "").trim();
  const id = String(entity?.id || "").trim();
  if (!id || !canEditSystemDomainRegistry(normalizedRegistryName)) return false;
  if (normalizedRegistryName === "employees" && entity.employmentAssignment) {
    const { employmentAssignment, ...employeeEntity } = entity;
    const currentEmployee = (getSystemDomainsRegistries().employees || []).find((employee) => employee.id === id) || {};
    const currentAssignment = (getSystemDomainsRegistries().employmentAssignments || [])
      .find((assignment) => assignment.employeeId === id && assignment.isPrimary !== false) || {};
    const candidate = normalizeSystemDomains({
      ...systemDomainsState,
      metadata: {
        ...(systemDomainsState.metadata || {}),
        updatedAt: new Date().toISOString(),
        lastMutationRegistry: "employees+employmentAssignments",
      },
      registries: {
        ...getSystemDomainsRegistries(),
        employees: [
          ...(getSystemDomainsRegistries().employees || []).filter((row) => row.id !== id),
          { ...currentEmployee, ...employeeEntity, id, updatedAt: new Date().toISOString() },
        ],
        employmentAssignments: [
          ...(getSystemDomainsRegistries().employmentAssignments || []).filter((row) => row.employeeId !== id || row.isPrimary === false),
          {
            ...currentAssignment,
            ...employmentAssignment,
            id: String(employmentAssignment.id || currentAssignment.id || `employment:${id}`),
            employeeId: id,
            isPrimary: true,
            sourceRef: currentAssignment.sourceRef || { system: "structure-and-employees-module" },
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    });
    const validation = validateSystemDomains(candidate);
    if (!validation.valid) {
      console.error("Compound employee mutation rejected", validation);
      return false;
    }
    return commitSystemDomainsCandidate(candidate, {
      source: options.source || "mutation:employees+employmentAssignments",
      push: true,
      reason: "system-domains:employees+employmentAssignments",
      serverCommand: options.serverCommand !== false,
      surface: options.surface || "production-structure",
    });
  }
  return updateSystemDomainRegistry(normalizedRegistryName, (rows) => {
    const currentEntity = rows.find((row) => row.id === id) || {};
    return [
      ...rows.filter((row) => row.id !== id),
      { ...currentEntity, ...entity, id, updatedAt: new Date().toISOString() },
    ];
  }, { source: options.source, serverCommand: options.serverCommand !== false, surface: options.surface || "production-structure" });
}

function archiveSystemDomainEntity(registryName = "", entityId = "", options = {}) {
  const normalizedRegistryName = String(registryName || "").trim();
  const normalizedEntityId = String(entityId || "").trim();
  if (!normalizedEntityId || !canEditSystemDomainRegistry(normalizedRegistryName)) return false;
  const archivedAt = new Date().toISOString();
  if (normalizedRegistryName === "employees") {
    const archiveDate = toDateInput(new Date());
    const candidate = normalizeSystemDomains({
      ...systemDomainsState,
      metadata: { ...(systemDomainsState.metadata || {}), updatedAt: archivedAt, lastMutationRegistry: "employees+employmentAssignments" },
      registries: {
        ...getSystemDomainsRegistries(),
        employees: (getSystemDomainsRegistries().employees || []).map((entity) => (
          entity.id === normalizedEntityId ? { ...entity, isActive: false, archivedAt } : entity
        )),
        employmentAssignments: (getSystemDomainsRegistries().employmentAssignments || []).map((assignment) => (
          assignment.employeeId === normalizedEntityId && assignment.isPrimary !== false && !assignment.validTo
            ? { ...assignment, validTo: archiveDate, updatedAt: archivedAt }
            : assignment
        )),
      },
    });
    const validation = validateSystemDomains(candidate);
    if (!validation.valid) return false;
    return commitSystemDomainsCandidate(candidate, {
      source: options.source || "mutation:archive-employee",
      push: true,
      reason: "system-domains:employees+employmentAssignments",
      serverCommand: options.serverCommand !== false,
      surface: options.surface || "production-structure",
    });
  }
  return updateSystemDomainRegistry(normalizedRegistryName, (rows) => rows.map((entity) => (
    entity.id === normalizedEntityId
      ? { ...entity, isActive: false, archivedAt }
      : entity
  )), { source: options.source, serverCommand: options.serverCommand !== false, surface: options.surface || "production-structure" });
}

function getProductionStructureWorkCenters(overrides = null) {
  const resolvedOverrides = overrides || ui?.productionStructureMatrixOverrides || {};
  const legacy = getLegacyProductionStructureWorkCenters(resolvedOverrides);
  return systemDomainsState ? projectSystemDomainWorkCenters(systemDomainsState, legacy) : legacy;
}

function getProductionStructureResources(overrides = null) {
  const resolvedOverrides = overrides || ui?.productionStructureMatrixOverrides || {};
  const legacyWorkCenters = getLegacyProductionStructureWorkCenters(resolvedOverrides);
  const legacyResources = getLegacyProductionStructureResources(resolvedOverrides);
  return systemDomainsState
    ? projectSystemDomainResources(systemDomainsState, legacyResources, legacyWorkCenters)
    : legacyResources;
}

function getProductionStructureEmployees(overrides = null) {
  const resolvedOverrides = overrides || ui?.productionStructureMatrixOverrides || {};
  const legacyWorkCenters = getLegacyProductionStructureWorkCenters(resolvedOverrides);
  const legacyEmployees = getLegacyProductionStructureEmployees(resolvedOverrides);
  return systemDomainsState
    ? projectSystemDomainEmployees(systemDomainsState, legacyEmployees, legacyWorkCenters)
    : legacyEmployees;
}

function getProductionStructureMasterProfiles(overrides = null) {
  if (!systemDomainsState) return getLegacyProductionStructureMasterProfiles(overrides || ui?.productionStructureMatrixOverrides || {});
  return getProductionStructureEmployees(overrides).filter((employee) => employee.personKind === "master" && employee.workCenterIds.length);
}

function getProductionStructureExecutorRows(overrides = null) {
  if (!systemDomainsState) return getLegacyProductionStructureExecutorRows(overrides || ui?.productionStructureMatrixOverrides || {});
  return getProductionStructureEmployees(overrides)
    .filter((employee) => employee.workCenterIds.length && (employee.canExecute !== false || employee.canReceiveSheet === true));
}

function getProductionStructureSummary(overrides = null) {
  return systemDomainsState
    ? getSystemDomainSummary(systemDomainsState)
    : getLegacyProductionStructureSummary(overrides || ui?.productionStructureMatrixOverrides || {});
}

function getPersonnelCalendarModel() {
  return systemDomainsState
    ? toPersonnelCalendarModel(systemDomainsState)
    : null;
}

function projectEmployeeAvailability(input = {}) {
  return projectPersonnelEmployeeAvailability({ ...(getPersonnelCalendarModel() || {}), ...input });
}

function resolveEffectiveScheduleAssignment(input = {}) {
  return resolvePersonnelScheduleAssignment({
    scheduleAssignments: getPersonnelCalendarModel()?.scheduleAssignments || [],
    ...input,
  });
}

function saveAttendanceEvent(eventValue, options = {}) {
  const events = (Array.isArray(eventValue) ? eventValue : [eventValue]).filter(Boolean);
  const employeeId = String(options.employeeId || events[0]?.employeeId || "").trim();
  const date = String(options.date || events[0]?.date || "").trim();
  if (!employeeId
    || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !authorizeSystemDomainAction("timesheet", "edit", getAccessControlEmployeeContext(employeeId))) return false;
  const baseEvent = events.find((event) => event?.kind !== "overtime") || events[0];
  const overtimeEvent = events.find((event) => event?.kind === "overtime");
  const canonical = {
    id: String(baseEvent?.id || `attendance:${employeeId}:${date}`).replace(/:overtime$/, ""),
    employeeId,
    date,
    type: String(baseEvent?.kind || baseEvent?.type || "work"),
    start: String(baseEvent?.startTime || baseEvent?.start || ""),
    end: String(baseEvent?.endTime || baseEvent?.end || ""),
    overtimeHours: overtimeEvent ? Math.max(0, Number(overtimeEvent.minutes || 0) / 60) : Math.max(0, Number(baseEvent?.overtimeHours || 0)),
    minutes: baseEvent?.kind === "overtime" ? Math.max(0, Number(baseEvent.minutes || 0)) : undefined,
    comment: String(baseEvent?.comment || ""),
    sourceRef: { system: "personnel-calendar", sourceRefs: baseEvent?.sourceRefs || [] },
  };
  return updateSystemDomainRegistry("attendanceEvents", (rows) => [
    ...rows.filter((row) => !(row.employeeId === employeeId && row.date === date)),
    canonical,
  ], {
    source: "timesheet:attendance-save",
    mutationKeys: [`${employeeId}|${date}`],
    // The timesheet form awaits this callback, so it is the second safe
    // writer to use the command path once the feature flag is enabled.
    serverCommand: true,
    surface: "timesheet",
  });
}

function removeAttendanceEvents({ employeeId = "", date = "", eventId = "" } = {}) {
  const normalizedEmployeeId = String(employeeId || "").trim();
  const normalizedDate = String(date || "").trim();
  const normalizedEventId = String(eventId || "").trim();
  if (!normalizedEmployeeId || !authorizeSystemDomainAction("timesheet", "edit", getAccessControlEmployeeContext(normalizedEmployeeId))) return false;
  return updateSystemDomainRegistry("attendanceEvents", (rows) => rows.filter((row) => {
    if (normalizedEventId && row.id === normalizedEventId) return false;
    return !(normalizedEmployeeId && normalizedDate && row.employeeId === normalizedEmployeeId && row.date === normalizedDate);
  }), {
    source: "timesheet:attendance-remove",
    mutationKeys: normalizedDate ? [`${normalizedEmployeeId}|${normalizedDate}`] : [],
    serverCommand: true,
    surface: "timesheet",
  });
}

function saveScheduleAssignment(assignment = {}, options = {}) {
  const employeeId = String(assignment.employeeId || options.employeeId || "").trim();
  const scheduleTemplateId = String(assignment.scheduleTemplateId || "").trim();
  if (!employeeId
    || !scheduleTemplateId
    || !authorizeSystemDomainAction("timesheet", "edit", getAccessControlEmployeeContext(employeeId))) return false;
  const canonical = {
    id: String(assignment.id || `schedule-assignment:${employeeId}`).trim(),
    employeeId,
    scheduleTemplateId,
    patternOffset: Number.isInteger(Number(assignment.patternOffset)) ? Number(assignment.patternOffset) : 0,
    validFrom: String(assignment.effectiveFrom || assignment.validFrom || "").trim(),
    validTo: String(assignment.effectiveTo || assignment.validTo || "").trim(),
    source: "personnel-calendar",
  };
  return updateSystemDomainRegistry("scheduleAssignments", (rows) => [
    ...rows.filter((row) => row.employeeId !== employeeId),
    canonical,
  ], { source: "timesheet:schedule-save", serverCommand: true, surface: "timesheet" });
}

function removeScheduleAssignment({ employeeId = "", assignmentId = "" } = {}) {
  const normalizedEmployeeId = String(employeeId || "").trim();
  const normalizedAssignmentId = String(assignmentId || "").trim();
  if (!normalizedEmployeeId || !authorizeSystemDomainAction("timesheet", "edit", getAccessControlEmployeeContext(normalizedEmployeeId))) return false;
  return updateSystemDomainRegistry("scheduleAssignments", (rows) => rows.filter((row) => (
    normalizedAssignmentId ? row.id !== normalizedAssignmentId : row.employeeId !== normalizedEmployeeId
  )), { source: "timesheet:schedule-remove", serverCommand: true, surface: "timesheet" });
}

function getAccessControlSessionSubjectId() {
  return `session:${String(ui?.activeRole || DEFAULT_INTERFACE_ROLE_ID).trim() || DEFAULT_INTERFACE_ROLE_ID}`;
}

function getAccessControlSubject() {
  const person = typeof getAuthenticatedAccessPerson === "function" ? getAuthenticatedAccessPerson() : null;
  if (person?.id && systemDomainsState) return getSystemDomainAccessSubject(systemDomainsState, person.id);
  return {
    id: getAccessControlSessionSubjectId(),
    subjectType: "employee",
    active: true,
    positionId: "",
    departmentIds: [],
    workCenterIds: [],
  };
}

function getAccessControlService() {
  if (!systemDomainsState
    || (hasObservedSystemDomainsPrimaryAuthority() && systemDomainsServerReadState.status !== "server")) return null;
  const subject = getAccessControlSubject();
  const assignments = toAccessControlAssignments(systemDomainsState);
  if (subject.id.startsWith("session:")) {
    assignments.push({
      id: `access-role-assignment:${subject.id}`,
      subjectType: "employee",
      subjectId: subject.id,
      roleId: String(ui?.activeRole || DEFAULT_INTERFACE_ROLE_ID),
      source: "runtime-session",
    });
  }
  return createAccessControlService({
    accessRoles: toAccessControlRoles(systemDomainsState),
    subjectRoleAssignments: assignments,
  });
}

function getAccessControlResourceContext() {
  return {};
}

function getAccessControlEmployeeContext(employeeId = "") {
  const target = systemDomainsState ? getSystemDomainAccessSubject(systemDomainsState, employeeId) : null;
  return {
    employeeId: String(employeeId || "").trim(),
    targetSubjectId: String(employeeId || "").trim(),
    departmentIds: target?.departmentIds || [],
    workCenterIds: target?.workCenterIds || [],
  };
}

function authorizeSystemDomainAction(moduleId = "", action = "view", resourceContext = {}) {
  const service = getAccessControlService();
  const subject = getAccessControlSubject();
  return Boolean(service?.can(subject, moduleId, action, resourceContext));
}

function canEditDirectorySection(sectionId = "") {
  const normalizedSectionId = normalizeDirectorySectionId(sectionId);
  if (normalizedSectionId === "statuses") return false;
  // Until every legacy Directory editor has a server owner, command-primary
  // Nomenclature must not expose controls whose monolithic snapshot write is
  // deliberately rejected by the runtime safety boundary.
  if (isNomenclatureServerCommandsPrimary()) return false;
  return authorizeSystemDomainAction("directories", "edit", { resourceId: normalizedSectionId });
}

function canEditCustomStatusDirectorySection() {
  if (isNomenclatureServerCommandsPrimary()) return false;
  return authorizeSystemDomainAction("directories", "edit", { resourceId: "statuses" });
}

function isUserManagedDirectoryStatus(row = {}) {
  return String(row.statusAuthority || "") === "user"
    && String(row.id || "").startsWith("custom-status-");
}

function canEditTimesheetEmployee(employeeId = "") {
  const normalizedEmployeeId = String(employeeId || "").trim();
  return Boolean(normalizedEmployeeId
    && authorizeSystemDomainAction("timesheet", "edit", getAccessControlEmployeeContext(normalizedEmployeeId)));
}

function notifyAccessControlFailure(reason = "access-control-write-failed") {
  console.warn("Access Control write rejected", reason);
}

function updateAccessRole({ roleId = "", patch = {} } = {}) {
  const normalizedRoleId = String(roleId || "").trim();
  if (!normalizedRoleId || !patch || typeof patch !== "object" || !authorizeSystemDomainAction("roles", "configure")) return false;
  return updateSystemDomainRegistry("accessRoles", (rows) => rows.map((role) => {
    if (role.id !== normalizedRoleId) return role;
    const next = { ...role };
    if (patch.label !== undefined) next.label = String(patch.label || "").trim() || role.label;
    if (patch.description !== undefined || patch.caption !== undefined) {
      next.description = String(patch.description ?? patch.caption ?? "").trim();
    }
    if (patch.scope !== undefined && ACCESS_ROLE_SCOPES.some((scope) => scope.id === patch.scope)) next.scope = patch.scope;
    if (patch.defaultModule !== undefined) next.defaultModuleId = String(patch.defaultModule || "").trim();
    if (patch.readOnly !== undefined) next.readOnly = Boolean(patch.readOnly);
    if (patch.isActive !== undefined) next.isActive = patch.isActive === true;
    return next;
  }), { source: "access-control:role-update", serverCommand: true, surface: "access-control" });
}

function setAccessGrant({ roleId = "", moduleId = "", action = "", allowed = false } = {}) {
  const normalizedRoleId = String(roleId || "").trim();
  const normalizedModuleId = String(moduleId || "").trim();
  const normalizedAction = String(action || "").trim();
  if (!normalizedRoleId
    || !normalizedModuleId
    || !ACCESS_ROLE_ACTIONS.some((item) => item.id === normalizedAction)
    || !authorizeSystemDomainAction("roles", "configure")) return false;
  const id = `access-grant:${normalizedRoleId}:${normalizedModuleId}:${normalizedAction}`;
  return updateSystemDomainRegistry("grants", (rows) => [
    ...rows.filter((grant) => !(grant.roleId === normalizedRoleId
      && grant.resourceId === normalizedModuleId
      && grant.actionId === normalizedAction)),
    {
      id,
      roleId: normalizedRoleId,
      resourceType: "module",
      resourceId: normalizedModuleId,
      actionId: normalizedAction,
      effect: allowed ? "allow" : "deny",
      sourceRef: { system: "access-control" },
    },
  ], { source: "access-control:grant-update", serverCommand: true, surface: "access-control" });
}

function setSubjectRoleAssignment({
  subjectId = "",
  subjectType = "employee",
  roleId = "",
  operation = "replace-effective",
  effectiveAt = null,
} = {}) {
  const normalizedSubjectId = String(subjectId || "").trim();
  const normalizedRoleId = String(roleId || "").trim();
  if (!normalizedSubjectId || subjectType !== "employee" || !authorizeSystemDomainAction("roles", "assign", getAccessControlEmployeeContext(normalizedSubjectId))) return false;
  if (operation !== "clear-effective" && !getSystemDomainsRegistries().accessRoles?.some((role) => role.id === normalizedRoleId)) return false;
  const validFrom = effectiveAt ? toDateInput(toDate(effectiveAt)) : "";
  return updateSystemDomainRegistry("roleAssignments", (rows) => {
    const retained = rows.filter((assignment) => assignment.employeeId !== normalizedSubjectId);
    if (operation === "clear-effective") return retained;
    return [...retained, {
      id: `access-role-assignment:${normalizedSubjectId}`,
      employeeId: normalizedSubjectId,
      roleId: normalizedRoleId,
      validFrom,
      validTo: "",
      source: "access-control",
      sourceRef: { system: "access-control" },
    }];
  }, { source: "access-control:assignment-update", serverCommand: true, surface: "access-control" });
}

function setResponsibilityScope({ scopeId = "", patch = {} } = {}) {
  const normalizedScopeId = String(scopeId || "").trim();
  const nextType = String(patch?.type || "").trim();
  if (!normalizedScopeId
    || !["factory", "department", "workCenter", "self"].includes(nextType)
    || !authorizeSystemDomainAction("roles", "configure")) return false;
  const roleMatch = normalizedScopeId.match(/^role-default-scope:(.+)$/);
  if (roleMatch) return updateAccessRole({ roleId: roleMatch[1], patch: { scope: nextType } });
  return false;
}

function buildCanonicalAccessRegistries(profiles = [], assignments = {}) {
  const accessRoles = profiles.map((profile) => ({
    id: profile.id,
    label: profile.label,
    description: profile.caption || profile.description || "",
    scope: profile.scope || "factory",
    defaultModuleId: profile.defaultModule || profile.defaultModuleId || "",
    icon: profile.icon || "",
    isActive: profile.isActive !== false,
    readOnly: Boolean(profile.readOnly ?? profile.readonly),
    sourceRef: { system: "runtime-default" },
  }));
  const grants = profiles.flatMap((profile) => Object.entries(profile.modulePermissions || {}).flatMap(([moduleId, permissions]) => (
    ACCESS_ROLE_ACTIONS.map((action) => ({
      id: `access-grant:${profile.id}:${moduleId}:${action.id}`,
      roleId: profile.id,
      resourceType: "module",
      resourceId: moduleId,
      actionId: action.id,
      effect: permissions?.[action.id] ? "allow" : "deny",
      sourceRef: { system: "runtime-default" },
    }))
  )));
  const roleAssignments = Object.entries(assignments).flatMap(([employeeId, roleId]) => (
    employeeId && roleId ? [{
      id: `access-role-assignment:${employeeId}`,
      employeeId,
      roleId,
      validFrom: "",
      validTo: "",
      source: "access-control-default",
      sourceRef: { system: "runtime-default" },
    }] : []
  ));
  return { accessRoles, grants, roleAssignments };
}

function resetAccessControlConfiguration() {
  if (!authorizeSystemDomainAction("roles", "configure")) return false;
  if (blockProtectedDestructiveAction(
    "resetAccessControlConfiguration",
    "Сброс ролей и доступов отключен в этом окружении для защиты пользовательских данных",
  )) return false;
  const defaults = getDefaultAccessRoleProfiles();
  const assignments = getLegacyAccessRoleAssignmentsForMigration();
  const registries = buildCanonicalAccessRegistries(defaults, assignments);
  const candidate = normalizeSystemDomains({
    ...systemDomainsState,
    metadata: { ...(systemDomainsState?.metadata || {}), updatedAt: new Date().toISOString(), lastMutationRegistry: "access-control-reset" },
    registries: { ...getSystemDomainsRegistries(), ...registries },
  });
  return commitSystemDomainsCandidate(candidate, {
    source: "mutation:access-control-reset",
    reason: "system-domains:access-control-reset",
    serverCommand: true,
    surface: "access-control",
  });
}

function syncResponsibilityPolicyFromCompatibilityState(masterId = "", { archive = false } = {}) {
  const normalizedMasterId = String(masterId || "").trim();
  if (!normalizedMasterId
    || !systemDomainsState
    || !authorizeSystemDomainAction("productionStructureMatrix", "assign", getAccessControlEmployeeContext(normalizedMasterId))) return false;
  const config = normalizePlainRecord(ui?.shiftMasterAssignmentMatrix)[normalizedMasterId] || {};
  return updateSystemDomainRegistry("responsibilityPolicies", (rows) => {
    const current = rows.find((policy) => policy.subjectEmployeeId === normalizedMasterId) || {};
    const retained = rows.filter((policy) => policy.subjectEmployeeId !== normalizedMasterId);
    return [...retained, {
      ...current,
      id: current.id || `responsibility:${normalizedMasterId}`,
      subjectEmployeeId: normalizedMasterId,
      mode: archive ? (current.mode || "department") : (config.mode || "department"),
      targetEmployeeIds: archive ? (current.targetEmployeeIds || []) : (Array.isArray(config.employeeIds) ? [...config.employeeIds] : []),
      isActive: !archive,
      updatedAt: new Date().toISOString(),
      archivedAt: archive ? new Date().toISOString() : "",
      sourceRef: { system: "shift-master-responsibility" },
    }];
  }, {
    source: "production-structure:responsibility-policy-sync",
    mutationKeys: [normalizedMasterId],
    serverCommand: true,
    surface: "production-structure",
  });
}
initializeRuntimeStateServiceModule();
initializePlanningCoreServiceModule();
initializePlanningRoutesServiceModule();
handleDevResetParams();
directoryState = measureBootStep("loadDirectoryState", () => loadDirectoryState());
planningState = measureBootStep("loadState", () => loadState());
ui = measureBootStep("loadUiState", () => loadUiState());
initializeProductsRenderModule();
const STARTUP_DATA_MIGRATION_VERSION = "2";
const STARTUP_DATA_MIGRATION_STORAGE_KEY = "mes-startup-data-migration-version";
const startupDataMigrationRequired = shouldRunStartupDataMigrations();

if (startupDataMigrationRequired) {
  measureBootStep("applyMesOrgStructureDefaults", () => applyMesOrgStructureDefaults());
  measureBootStep("ensureStatusDirectoryDefaults", () => ensureStatusDirectoryDefaults());
  measureBootStep("migrateDepartmentsToUnifiedWorkCenters", () => migrateDepartmentsToUnifiedWorkCenters());
  measureBootStep("migrateProjectEntityToSpecifications", () => migrateProjectEntityToSpecifications());
  measureBootStep("migrateSpecificationBomRowsToNomenclature", () => migrateSpecificationBomRowsToNomenclature());
  measureBootStep("syncNomenclatureTypesFromItems", () => syncNomenclatureTypesFromItems({ persist: true }));
  measureBootStep("migratePlanningManualLaborUiToRoutes", () => migratePlanningManualLaborUiToRoutes());
}
measureBootStep("alignGanttWindowToPlan", () => alignGanttWindowToPlan({ onlyWhenFar: true }));
if (startupDataMigrationRequired) {
  measureBootStep("recoverPlanningStateFromStorageIfRuntimeEmpty", () => recoverPlanningStateFromStorageIfRuntimeEmpty("startup-migrations"));
}

function shouldRunStartupDataMigrations() {
  try {
    return window.localStorage.getItem(STARTUP_DATA_MIGRATION_STORAGE_KEY) !== STARTUP_DATA_MIGRATION_VERSION;
  } catch {
    // Private/locked-down storage must preserve the compatibility path.
    return true;
  }
}

function completeStartupDataMigrations() {
  if (!startupDataMigrationRequired) return;
  try {
    window.localStorage.setItem(STARTUP_DATA_MIGRATION_STORAGE_KEY, STARTUP_DATA_MIGRATION_VERSION);
  } catch {
    // The migrations are idempotent. Retrying on a later boot is safe.
  }
}

const directorySections = [
  { id: "operations", label: "Операции", description: "Операции с привязкой к отделам", count: () => getOperationMapRows().length },
  { id: "componentTypes", label: "Типы компонентов", description: "Корпуса и коэффициенты SMT-компонентов", count: () => directoryState.componentTypes.length },
  { id: "nomenclatureTypes", label: "Типы номенклатуры", description: "Разделы, которые используются в модуле номенклатуры", count: () => directoryState.nomenclatureTypes.length },
  { id: "statuses", label: "Статусы", description: "Единый реестр статусов, сигналов и точек изменения.", count: () => directoryState.statuses.length },
];
const LEGACY_PRODUCTION_DIRECTORY_SECTION_IDS = new Set([
  "workCenters",
  "departments",
  "resources",
  "equipment",
  "productionResources",
  "norms",
  "employees",
]);

const directorySectionGroups = [
  {
    label: "Система",
    description: "статусы и системные настройки",
    ids: ["statuses"],
  },
  {
    label: "Технологии",
    description: "операции, изделия, платы, SMT и номенклатура",
    ids: ["operations", "componentTypes", "nomenclatureTypes"],
  },
];

function normalizeDirectorySectionId(sectionId = "") {
  const id = String(sectionId || "").trim();
  if (directorySections.some((section) => section.id === id)) return id;
  if (LEGACY_PRODUCTION_DIRECTORY_SECTION_IDS.has(id)) return "operations";
  return id || "operations";
}

const chartColors = ["#2563eb", "#0284c7", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#64748b"];

const statusReportColors = {
  planned: "#64748b",
  in_progress: "#2563eb",
  paused: "#64748b",
  completed: "#16a34a",
  overdue: "#dc2626",
  problem: "#d97706",
};

function handleDevResetParams(...args) { return runtimeStateService.handleDevResetParams(...args); }
function backupLocalStateBeforeReset(...args) { return runtimeStateService.backupLocalStateBeforeReset(...args); }
function parseJsonObject(...args) { return runtimeStateService.parseJsonObject(...args); }
function getSharedStateClientId(...args) { return runtimeStateService.getSharedStateClientId(...args); }
function getSharedStateActorLabel(...args) { return runtimeStateService.getSharedStateActorLabel(...args); }
function getSharedUiSnapshot(...args) { return runtimeStateService.getSharedUiSnapshot(...args); }
function getSharedUiSignature(...args) { return runtimeStateService.getSharedUiSignature(...args); }
function rememberSharedUiSignature(...args) { return runtimeStateService.rememberSharedUiSignature(...args); }
function getSharedUiDirtyMarker(...args) { return runtimeStateService.getSharedUiDirtyMarker(...args); }
function markSharedUiDirty(...args) { return runtimeStateService.markSharedUiDirty(...args); }
function clearSharedUiDirty(...args) { return runtimeStateService.clearSharedUiDirty(...args); }
function shouldPreserveLocalSharedUi(...args) { return runtimeStateService.shouldPreserveLocalSharedUi(...args); }
function applySharedUiSnapshot(...args) { return runtimeStateService.applySharedUiSnapshot(...args); }
function isSharedStateTemporarilyDisabled(...args) { return runtimeStateService.isSharedStateTemporarilyDisabled(...args); }
function rememberSharedStateDisabled(...args) { return runtimeStateService.rememberSharedStateDisabled(...args); }
function forgetSharedStateDisabled(...args) { return runtimeStateService.forgetSharedStateDisabled(...args); }
function getSharedStateValues(...args) { return runtimeStateService.getSharedStateValues(...args); }
function writeSharedStateValues(...args) { return runtimeStateService.writeSharedStateValues(...args); }
function applySharedStateSnapshot(...args) { return runtimeStateService.applySharedStateSnapshot(...args); }
function syncExternalStorageState(...args) { return runtimeStateService.syncExternalStorageState(...args); }
function bindExternalStorageSync(...args) { return runtimeStateService.bindExternalStorageSync(...args); }
function scheduleSharedStatePush(...args) { return runtimeStateService.scheduleSharedStatePush(...args); }
function scheduleSharedStateSyncBootstrap(...args) { return runtimeStateService.scheduleSharedStateSyncBootstrap(...args); }
function startRuntimeApplication(...args) { return runtimeStateService.startRuntimeApplication(...args); }
function hasMeaningfulPlanningState(...args) { return runtimeStateService.hasMeaningfulPlanningState(...args); }
function getBootstrapSnapshotCountsFromValues(...args) { return runtimeStateService.getBootstrapSnapshotCountsFromValues(...args); }
function isUsableBootstrapSnapshot(...args) { return runtimeStateService.isUsableBootstrapSnapshot(...args); }
function shouldPreferBundledBootstrapSnapshot(...args) { return runtimeStateService.shouldPreferBundledBootstrapSnapshot(...args); }
function getBootstrapSnapshot(...args) { return runtimeStateService.getBootstrapSnapshot(...args); }
function applyBootstrapSnapshotValues(...args) { return runtimeStateService.applyBootstrapSnapshotValues(...args); }
function restoreBootstrapSnapshotIfCurrentPlanningEmpty(...args) { return runtimeStateService.restoreBootstrapSnapshotIfCurrentPlanningEmpty(...args); }
function createDefaultDirectoryState(...args) { return runtimeStateService.createDefaultDirectoryState(...args); }
function loadState(...args) { return runtimeStateService.loadState(...args); }
function persistState(...args) {
  const stateBeforePersist = planningState;
  const result = runtimeStateService.persistState(...args);
  // Most commands update collections in-place. Their service wrapper commits
  // the same root object, which is deliberately ignored above; make the
  // weekly projection stale exactly once after the durable snapshot changes.
  if (result?.changed && planningState === stateBeforePersist) {
    invalidateWeeklyPlanningPeriod();
  }
  return result;
}
function recoverPlanningStateFromStorageIfRuntimeEmpty(...args) { return runtimeStateService.recoverPlanningStateFromStorageIfRuntimeEmpty(...args); }
function recoverPlanningRuntimeSnapshot(...args) { return runtimeStateService.recoverPlanningRuntimeSnapshot(...args); }
function parsePlanningStateSnapshot(...args) { return runtimeStateService.parsePlanningStateSnapshot(...args); }
function backupRawPlanningState(...args) { return runtimeStateService.backupRawPlanningState(...args); }
function collectPlanningRecoverySnapshots(...args) { return runtimeStateService.collectPlanningRecoverySnapshots(...args); }
function getCriticalPlanningCounts(...args) { return runtimeStateService.getCriticalPlanningCounts(...args); }
function getPlanningRecoveryScore(...args) { return runtimeStateService.getPlanningRecoveryScore(...args); }
function restorePlanningStateFromBackups(...args) { return runtimeStateService.restorePlanningStateFromBackups(...args); }
function preserveCriticalPlanningEntities(...args) { return runtimeStateService.preserveCriticalPlanningEntities(...args); }
function parseDirectoryStateSnapshot(...args) { return runtimeStateService.parseDirectoryStateSnapshot(...args); }
function backupRawDirectoryState(...args) { return runtimeStateService.backupRawDirectoryState(...args); }
function collectDirectoryRecoverySnapshots(...args) { return runtimeStateService.collectDirectoryRecoverySnapshots(...args); }
function getDirectoryRecoveryScore(...args) { return runtimeStateService.getDirectoryRecoveryScore(...args); }
function restoreDirectoryStateFromBackups(...args) { return runtimeStateService.restoreDirectoryStateFromBackups(...args); }
function getCriticalDirectoryCounts(...args) { return runtimeStateService.getCriticalDirectoryCounts(...args); }
function getDirectoryRowTimestamp(...args) { return runtimeStateService.getDirectoryRowTimestamp(...args); }
function readDirectoryDeletedEntities(...args) { return runtimeStateService.readDirectoryDeletedEntities(...args); }
function writeDirectoryDeletedEntities(...args) { return runtimeStateService.writeDirectoryDeletedEntities(...args); }
function recordDirectoryEntityDeletion(...args) { return runtimeStateService.recordDirectoryEntityDeletion(...args); }
function wasDirectoryEntityDeletedAfter(...args) { return runtimeStateService.wasDirectoryEntityDeletedAfter(...args); }
function omitDeletedCriticalDirectoryEntities(...args) { return runtimeStateService.omitDeletedCriticalDirectoryEntities(...args); }
function mergeCriticalDirectorySection(...args) { return runtimeStateService.mergeCriticalDirectorySection(...args); }
function preserveCriticalDirectoryEntities(...args) { return runtimeStateService.preserveCriticalDirectoryEntities(...args); }
function withDirectoryEntityRemovalAllowed(...args) { return runtimeStateService.withDirectoryEntityRemovalAllowed(...args); }
function withPlanningEntityRemovalAllowed(...args) { return runtimeStateService.withPlanningEntityRemovalAllowed(...args); }
function loadDirectoryState(...args) { return runtimeStateService.loadDirectoryState(...args); }
function ensureStatusDirectoryDefaults(...args) { return runtimeStateService.ensureStatusDirectoryDefaults(...args); }
function isSameNumericValue(...args) { return runtimeStateService.isSameNumericValue(...args); }
function persistDirectoryState(...args) { return runtimeStateService.persistDirectoryState(...args); }
function persistDirectoryStateDurably(...args) { return runtimeStateService.persistDirectoryStateDurably(...args); }
function persistDirectoryStateWithRemoval(...args) { return runtimeStateService.persistDirectoryStateWithRemoval(...args); }
function persistNomenclatureDirectoryMutationDurably(...args) { return runtimeStateService.persistNomenclatureDirectoryMutationDurably(...args); }
function initializeRuntimeStateServiceModule() {
  runtimeStateService = createRuntimeStateServiceModule({
  APP_VERSION,
  BOOTSTRAP_SNAPSHOT_FILE_URL,
  BOOTSTRAP_SNAPSHOT_RESTORE_ENABLED,
  BOOTSTRAP_SNAPSHOT_STORAGE_KEY,
  BOOTSTRAP_SNAPSHOT_VALUE_KEYS,
  CRITICAL_DIRECTORY_SECTION_IDS,
  DEFAULT_BOM_LISTS,
  DEFAULT_COMPONENT_TYPES,
  DEFAULT_NOMENCLATURE_TYPES,
  DEFAULT_SPECIFICATIONS,
  DEFAULT_STATUSES,
  DIRECTORY_BACKUP_STORAGE_KEY,
  DIRECTORY_DEFAULTS_STORAGE_KEY,
  DIRECTORY_DELETED_ENTITIES_STORAGE_KEY,
  DIRECTORY_STORAGE_KEY,
  MES_OPERATION_MAP,
  PLANNING_BACKUP_STORAGE_KEY,
  REMOVED_DIRECTORY_STATUS_ID_PREFIXES,
  SHARED_STATE_API_URL,
  SHARED_STATE_CLIENT_ID_KEY,
  SHARED_STATE_DISABLED_RECHECK_MS,
  SHARED_STATE_DISABLED_UNTIL_KEY,
  SHARED_STATE_POLL_INTERVAL_MS,
  SHARED_STATE_SAVE_DEBOUNCE_MS,
  SHARED_STATE_VALUE_KEYS,
  SPECIFICATIONS2_STORAGE_KEY,
  SHARED_UI_LOCAL_DIRTY_KEY,
  SHARED_UI_LOCAL_DIRTY_TTL_MS,
  STATE_RESET_BACKUP_STORAGE_KEY,
  STORAGE_KEY,
  STORAGE_KEYS,
  SYSTEM_DOMAINS_STORAGE_KEY,
  SYSTEM_DOMAINS_PRIMARY_TOMBSTONE_KEY,
  alignGanttWindowToPlan,
  appendLocalDataSafetyAudit,
  createDefaultPlanningState,
  executeNomenclatureServerCommand: (...args) => executeNomenclatureServerCommand(...args),
  getActiveInterfaceRole,
  getBootstrapSnapshotCountsFromState,
  isMeaningfulBootstrapSnapshotCounts,
  isUsableBootstrapSnapshotPayload,
  isShiftExecutionServerAuthoritative,
  isSystemDomainsServerAuthoritative: () => hasObservedSystemDomainsPrimaryAuthority(),
  isNomenclatureServerCommandsPrimary: () => isNomenclatureServerCommandsPrimary(),
  loadUiState,
  measureBootStep,
  mergeMesWorkCenters,
  normalizeAccessRoleAssignments,
  normalizeAccessRoleProfiles, normalizeBomImportRow,
  normalizeDirectoryRow,
  normalizeDirectoryState,
  normalizeDispatchFact,
  normalizeGanttDependencyRouteStore,
  normalizePlainRecord,
  normalizePlanningCorrection,
  normalizePlanningState,
  normalizeShiftMasterAssignment,
  normalizeShiftMasterAssignmentMatrix,
  normalizeShiftMasterRecordMap,
  notifySaveSuccess,
  // The Planning workbench renders from the compact order list and selected
  // detail. Loading every slot here makes its first frame pay Gantt's cost.
  // The full projection is requested only by an operation that needs it.
  getInitialPlanningBootstrapMode: () => (
    PLANNING_STARTUP_PROJECTION_MODULE_IDS.has(ui?.activeModule) ? "required" : "deferred"
  ),
  onPlanningBootstrap: () => hydrateInitialPlanningServerBootstrap(),
  onPlanningSnapshotSynchronized: () => hydratePlanningAfterSharedSync(),
  shouldHydratePlanningAfterSharedSync: () => (
    ui?.activeModule === "planning" || ui?.activeModule === "gantt"
  ),
  onSystemDomainsCompatibilityStatus: (status) => handleSystemDomainsCompatibilityStatus(status),
  onSystemDomainsSnapshotRetired: () => {
    // A tombstone proves the browser may no longer authorize or mutate from
    // its cached compatibility copy. Rehydrate only from PostgreSQL.
    systemDomainsServerReadState = { status: "loading", error: "", revision: 0 };
    void hydrateSystemDomainsServerRead("", { fallbackToLegacy: false, force: true });
  },
  persistUiState,
  publishBootPerformance,
  reloadSystemDomainsState,
  refreshNomenclatureReactProjection: () => refreshMountedNomenclatureReactProjection(),
  render,
  sharedStateStatus,
  shouldPreferBundledBootstrapSnapshotPayload,
  syncActiveRoleWithAuthorization,
  syncProductionStructureMatrixToPlanningState,
  updateClockOnly,
  getUi: () => ui,
  setUi: (nextState) => { ui = nextState; },
  getPlanningState: () => planningState,
  setPlanningState: setPlanningStateAndInvalidate,
  getDirectoryState: () => directoryState,
  setDirectoryState: (nextState) => { directoryState = nextState; },
  getAppBootstrapped: () => appBootstrapped,
  setAppBootstrapped: (nextValue) => { appBootstrapped = nextValue; },
  getExternalStorageSyncTimer: () => externalStorageSyncTimer,
  setExternalStorageSyncTimer: (nextValue) => { externalStorageSyncTimer = nextValue; },
  getSharedStateApplyingRemote: () => sharedStateApplyingRemote,
  setSharedStateApplyingRemote: (nextValue) => { sharedStateApplyingRemote = nextValue; },
  getBundledBootstrapSnapshot: () => bundledBootstrapSnapshot,
  setBundledBootstrapSnapshot: (nextValue) => { bundledBootstrapSnapshot = nextValue; },
  getBootstrapSnapshotLoadStarted: () => bootstrapSnapshotLoadStarted,
  setBootstrapSnapshotLoadStarted: (nextValue) => { bootstrapSnapshotLoadStarted = nextValue; },
  getBootstrapSnapshotLoadPromise: () => bootstrapSnapshotLoadPromise,
  setBootstrapSnapshotLoadPromise: (nextValue) => { bootstrapSnapshotLoadPromise = nextValue; },
  getDirectoryEntityRemovalAllowed: () => directoryEntityRemovalAllowed,
  setDirectoryEntityRemovalAllowed: (nextValue) => { directoryEntityRemovalAllowed = nextValue; },
  getPlanningEntityRemovalAllowed: () => planningEntityRemovalAllowed,
  setPlanningEntityRemovalAllowed: (nextValue) => { planningEntityRemovalAllowed = nextValue; },
  });
}

function resolveProductionResourceType(...args) { return planningCoreService.resolveProductionResourceType(...args); }
function mapLegacyWorkCenterId(...args) { return planningCoreService.mapLegacyWorkCenterId(...args); }
function isWarehouseWorkCenterId(...args) { return planningCoreService.isWarehouseWorkCenterId(...args); }
function hasManufacturingOutputReceiptText(...args) { return planningCoreService.hasManufacturingOutputReceiptText(...args); }
function hasNonOutputWarehouseText(...args) { return planningCoreService.hasNonOutputWarehouseText(...args); }
function isManufacturingOutputReceiptOperation(...args) { return planningCoreService.isManufacturingOutputReceiptOperation(...args); }
function isManufacturingOutputReceiptRouteStep(...args) { return planningCoreService.isManufacturingOutputReceiptRouteStep(...args); }
function isManufacturingOutputReceiptSlot(...args) { return planningCoreService.isManufacturingOutputReceiptSlot(...args); }
function isSmtRouteInstructionWorkCenterId(...args) { return planningCoreService.isSmtRouteInstructionWorkCenterId(...args); }
function getRouteInstructionWorkCenterId(...args) { return planningCoreService.getRouteInstructionWorkCenterId(...args); }
function getOperationRouteWorkCenterId(...args) { return planningCoreService.getOperationRouteWorkCenterId(...args); }
function getPlanningCandidateWorkCenterIdsForRouteWorkCenter(...args) { return planningCoreService.getPlanningCandidateWorkCenterIdsForRouteWorkCenter(...args); }
function getRouteStepPlanningCandidateWorkCenterIds(...args) { return planningCoreService.getRouteStepPlanningCandidateWorkCenterIds(...args); }
function getRouteStepExplicitPlanningWorkCenterId(...args) { return planningCoreService.getRouteStepExplicitPlanningWorkCenterId(...args); }
function routeStepRequiresManualPlanningLine(...args) { return planningCoreService.routeStepRequiresManualPlanningLine(...args); }
function getRouteStepSelectedPlanningWorkCenterId(...args) { return planningCoreService.getRouteStepSelectedPlanningWorkCenterId(...args); }
function isPlanningWorkCenterCompatibleWithRouteStep(...args) { return planningCoreService.isPlanningWorkCenterCompatibleWithRouteStep(...args); }
function getPlanningResourceForRouteStep(...args) { return planningCoreService.getPlanningResourceForRouteStep(...args); }
function getPlanningAssignmentForRouteStep(...args) { return planningCoreService.getPlanningAssignmentForRouteStep(...args); }
function getManualPlanningAssignmentForRouteStep(...args) { return planningCoreService.getManualPlanningAssignmentForRouteStep(...args); }
function getRouteStepPlanningAssignmentForSlot(...args) { return planningCoreService.getRouteStepPlanningAssignmentForSlot(...args); }
function resolveWorkCenterIdFromName(...args) { return planningCoreService.resolveWorkCenterIdFromName(...args); }
function getProductionResourceWorkCenterId(...args) { return planningCoreService.getProductionResourceWorkCenterId(...args); }
function normalizeProductionResourceCapacity(...args) { return planningCoreService.normalizeProductionResourceCapacity(...args); }
function normalizeProductionResource(...args) { return planningCoreService.normalizeProductionResource(...args); }
function getSmtLineParentResourceId(...args) { return planningCoreService.getSmtLineParentResourceId(...args); }
function migrateLegacyResourceRow(...args) { return planningCoreService.migrateLegacyResourceRow(...args); }
function migrateLegacyEquipmentRow(...args) { return planningCoreService.migrateLegacyEquipmentRow(...args); }
function dedupeProductionResources(...args) { return planningCoreService.dedupeProductionResources(...args); }
function mapLegacyResourceId(...args) { return planningCoreService.mapLegacyResourceId(...args); }
function isLegacyGeneratedOperation(...args) { return planningCoreService.isLegacyGeneratedOperation(...args); }
function findMesOperationReplacement(...args) { return planningCoreService.findMesOperationReplacement(...args); }
function mergeMesOperationMap(...args) { return planningCoreService.mergeMesOperationMap(...args); }
function normalizeMesRouteEntity(...args) { return planningCoreService.normalizeMesRouteEntity(...args); }
function replaceLegacyOrganizationTerms(...args) { return planningCoreService.replaceLegacyOrganizationTerms(...args); }
function normalizeDirectoryOrganizationTerminology(...args) { return planningCoreService.normalizeDirectoryOrganizationTerminology(...args); }
function applyMesOrgStructureDefaults(...args) { return planningCoreService.applyMesOrgStructureDefaults(...args); }
function buildDefaultProductionResources(...args) { return planningCoreService.buildDefaultProductionResources(...args); }
function getProductionResources(...args) { return planningCoreService.getProductionResources(...args); }
function getProductionResource(...args) { return planningCoreService.getProductionResource(...args); }
function resourceParticipatesInPlanning(...args) { return planningCoreService.resourceParticipatesInPlanning(...args); }
function resourceParticipatesInCalculation(...args) { return planningCoreService.resourceParticipatesInCalculation(...args); }
function getProductionResourcesForWorkCenter(...args) { return planningCoreService.getProductionResourcesForWorkCenter(...args); }
function makeFallbackProductionResource(...args) { return planningCoreService.makeFallbackProductionResource(...args); }
function normalizeUnitType(...args) { return planningCoreService.normalizeUnitType(...args); }
function isPlanningWorkCenter(...args) { return planningCoreService.isPlanningWorkCenter(...args); }
function getPlanningWorkCenters(...args) { return planningCoreService.getPlanningWorkCenters(...args); }
function isRouteInstructionWorkCenter(...args) { return planningCoreService.isRouteInstructionWorkCenter(...args); }
function getRouteInstructionWorkCenters(...args) { return planningCoreService.getRouteInstructionWorkCenters(...args); }
function normalizeWorkSchedule(...args) { return planningCoreService.normalizeWorkSchedule(...args); }
function normalizeWorkMode(...args) { return planningCoreService.normalizeWorkMode(...args); }
function getDefaultWorkMode(...args) { return planningCoreService.getDefaultWorkMode(...args); }
function formatWorkShift(...args) { return planningCoreService.formatWorkShift(...args); }
function getWorkCalendarLabel(...args) { return planningCoreService.getWorkCalendarLabel(...args); }
function normalizeWorkCenterUnit(...args) { return planningCoreService.normalizeWorkCenterUnit(...args); }
function getLegacyDepartmentTargetCenterId(...args) { return planningCoreService.getLegacyDepartmentTargetCenterId(...args); }
function getUnifiedUnitName(...args) { return planningCoreService.getUnifiedUnitName(...args); }
function migrateSpecificationDepartmentNames(...args) { return planningCoreService.migrateSpecificationDepartmentNames(...args); }
function migrateDepartmentsToUnifiedWorkCenters(...args) { return planningCoreService.migrateDepartmentsToUnifiedWorkCenters(...args); }
function migrateProjectEntityToSpecifications(...args) { return planningCoreService.migrateProjectEntityToSpecifications(...args); }
function notifySaveSuccess(...args) { return planningCoreService.notifySaveSuccess(...args); }
function renderPendingSaveFeedback(...args) { return planningCoreService.renderPendingSaveFeedback(...args); }
function scheduleGlobalSaveUxRefresh(...args) { return planningCoreService.scheduleGlobalSaveUxRefresh(...args); }
function getMesSignalMeta(...args) { return planningCoreService.getMesSignalMeta(...args); }
function mountGlobalVisualSystem(...args) { return planningCoreService.mountGlobalVisualSystem(...args); }
function mountVisualModeTray(...args) { return planningCoreService.mountVisualModeTray(...args); }
function getFormControlSignatureEntry(...args) { return planningCoreService.getFormControlSignatureEntry(...args); }
function getFormSignature(...args) { return planningCoreService.getFormSignature(...args); }
function isUnsavedCreateForm(...args) { return planningCoreService.isUnsavedCreateForm(...args); }
function setSaveButtonDisabled(...args) { return planningCoreService.setSaveButtonDisabled(...args); }
function bindGlobalFormDirtyTracking(...args) { return planningCoreService.bindGlobalFormDirtyTracking(...args); }
function normalizeOptionalPositiveInteger(...args) { return planningCoreService.normalizeOptionalPositiveInteger(...args); }
function normalizeGanttDependencyRouteStore(...args) { return planningCoreService.normalizeGanttDependencyRouteStore(...args); }
function cloneGanttDependencyRouteStore(...args) { return planningCoreService.cloneGanttDependencyRouteStore(...args); }
function normalizePlanningLaborNoteByRow(...args) { return planningCoreService.normalizePlanningLaborNoteByRow(...args); }
function normalizePlanningOrderLaborByStepId(...args) { return planningCoreService.normalizePlanningOrderLaborByStepId(...args); }
function normalizePlanningLegacyManualLaborByStep(...args) { return planningCoreService.normalizePlanningLegacyManualLaborByStep(...args); }
function isDeepLinkDirectorySectionId(...args) { return planningCoreService.isDeepLinkDirectorySectionId(...args); }
function normalizeDeepLinkModuleId(...args) { return planningCoreService.normalizeDeepLinkModuleId(...args); }
function normalizeStoredModuleId(...args) { return planningCoreService.normalizeStoredModuleId(...args); }
function getAuthGateSessionDateKey(...args) { return planningCoreService.getAuthGateSessionDateKey(...args); }
function getAuthGateSessionExpiresAt(...args) { return planningCoreService.getAuthGateSessionExpiresAt(...args); }
function getAuthGateSession(...args) { return planningCoreService.getAuthGateSession(...args); }
function getAuthGateSessionUnlocked(...args) { return planningCoreService.getAuthGateSessionUnlocked(...args); }
function setAuthGateSessionUnlocked(...args) { return planningCoreService.setAuthGateSessionUnlocked(...args); }
function applyAuthGateSession(...args) { return planningCoreService.applyAuthGateSession(...args); }
function isAuthGateQaBypassEnabled(...args) { return planningCoreService.isAuthGateQaBypassEnabled(...args); }
function isAdminRuntimeHost(...args) { return planningCoreService.isAdminRuntimeHost(...args); }
function isAuthGateUnlocked(...args) { return planningCoreService.isAuthGateUnlocked(...args); }
function lockAuthGate(...args) { return planningCoreService.lockAuthGate(...args); }
function unlockAuthGate(...args) { return planningCoreService.unlockAuthGate(...args); }
function ensureAuthGateModule(...args) { return planningCoreService.ensureAuthGateModule(...args); }
function getUrlUiOverrides(...args) { return planningCoreService.getUrlUiOverrides(...args); }
function applyUrlUiOverrides(...args) { return planningCoreService.applyUrlUiOverrides(...args); }
function normalizeShiftMasterBoardSwimlane(...args) { return planningCoreService.normalizeShiftMasterBoardSwimlane(...args); }
function normalizeShiftMasterBoardFocus(...args) { return planningCoreService.normalizeShiftMasterBoardFocus(...args); }
function normalizeShiftMasterBoardLane(...args) { return planningCoreService.normalizeShiftMasterBoardLane(...args); }
function normalizePlainRecord(...args) { return planningCoreService.normalizePlainRecord(...args); }
function normalizeShiftMasterAssignmentScopeMode(...args) { return planningCoreService.normalizeShiftMasterAssignmentScopeMode(...args); }
function normalizeIdList(...args) { return planningCoreService.normalizeIdList(...args); }
function normalizeShiftMasterAssignmentMatrix(...args) { return planningCoreService.normalizeShiftMasterAssignmentMatrix(...args); }
function normalizeShiftMasterBoardRiskReason(...args) { return planningCoreService.normalizeShiftMasterBoardRiskReason(...args); }
function getShiftMasterBoardRiskLabel(...args) { return planningCoreService.getShiftMasterBoardRiskLabel(...args); }
function syncUiWithUrlParams(...args) { return planningCoreService.syncUiWithUrlParams(...args); }
function updateModuleUrlParam(...args) { return planningCoreService.updateModuleUrlParam(...args); }
function loadUiState(...args) { return planningCoreService.loadUiState(...args); }
function persistUiState(...args) { return planningCoreService.persistUiState(...args); }
function getPlanningOrderLaborKey(...args) { return planningCoreService.getPlanningOrderLaborKey(...args); }
function parsePlanningOrderLaborKey(...args) { return planningCoreService.parsePlanningOrderLaborKey(...args); }
function setPlanningOrderLaborSetting(...args) { return planningCoreService.setPlanningOrderLaborSetting(...args); }
function migratePlanningManualLaborUiToRoutes(...args) { return planningCoreService.migratePlanningManualLaborUiToRoutes(...args); }
function persistAuthState(...args) { return planningCoreService.persistAuthState(...args); }
function normalizeDirectoryState(...args) { return planningCoreService.normalizeDirectoryState(...args); }
function normalizeDirectoryRow(...args) { return planningCoreService.normalizeDirectoryRow(...args); }
function shouldKeepDirectoryRow(...args) { return planningCoreService.shouldKeepDirectoryRow(...args); }
function isBlankDirectoryRow(...args) { return planningCoreService.isBlankDirectoryRow(...args); }
function mergeMesWorkCenters(...args) { return planningCoreService.mergeMesWorkCenters(...args); }
function syncProductionStructureMatrixToPlanningState(...args) { return planningCoreService.syncProductionStructureMatrixToPlanningState(...args); }
function buildLegacyBatchRouteIdMap(...args) { return planningCoreService.buildLegacyBatchRouteIdMap(...args); }
function getSlotRouteId(...args) { return planningCoreService.getSlotRouteId(...args); }
function getSlotPlanningOrderId(...args) { return planningCoreService.getSlotPlanningOrderId(...args); }
function getSlotProductionContextId(...args) { return planningCoreService.getSlotProductionContextId(...args); }
function slotMatchesProductionContext(...args) { return planningCoreService.slotMatchesProductionContext(...args); }
function slotMatchesPlanningOrder(...args) { return planningCoreService.slotMatchesPlanningOrder(...args); }
function normalizeSlotOrderLink(...args) { return planningCoreService.normalizeSlotOrderLink(...args); }
function getRouteStepSlotDeduplicationScore(...args) { return planningCoreService.getRouteStepSlotDeduplicationScore(...args); }
function compareRouteStepSlotKeepPriority(...args) { return planningCoreService.compareRouteStepSlotKeepPriority(...args); }
function dedupeRouteStepSlots(...args) { return planningCoreService.dedupeRouteStepSlots(...args); }
function normalizePlanningState(...args) { return planningCoreService.normalizePlanningState(...args); }
function isCompletePlanningLaborSetting(...args) { return planningCoreService.isCompletePlanningLaborSetting(...args); }
function buildPlanningLaborSettingFromSlot(...args) { return planningCoreService.buildPlanningLaborSettingFromSlot(...args); }
function getLegacySlotPlanningLaborDurationMs(...args) { return planningCoreService.getLegacySlotPlanningLaborDurationMs(...args); }
function migrateLegacySlotToPlanningOrderLabor(...args) { return planningCoreService.migrateLegacySlotToPlanningOrderLabor(...args); }
function repairPlanningOrderLaborStoresFromSlots(...args) { return planningCoreService.repairPlanningOrderLaborStoresFromSlots(...args); }
function normalizePlanningSlotResourceLink(...args) { return planningCoreService.normalizePlanningSlotResourceLink(...args); }
function normalizeShiftMasterRecordMap(...args) { return planningCoreService.normalizeShiftMasterRecordMap(...args); }
function pruneSlotLinkedRecordMap(...args) { return planningCoreService.pruneSlotLinkedRecordMap(...args); }
function normalizeShiftMasterExecutorQuantity(...args) { return planningCoreService.normalizeShiftMasterExecutorQuantity(...args); }
function normalizeShiftMasterFactQuantity(...args) { return planningCoreService.normalizeShiftMasterFactQuantity(...args); }
function normalizeShiftMasterExecutors(...args) { return planningCoreService.normalizeShiftMasterExecutors(...args); }
function normalizeShiftMasterAssignment(...args) { return planningCoreService.normalizeShiftMasterAssignment(...args); }
function normalizeDispatchFact(...args) { return planningCoreService.normalizeDispatchFact(...args); }
function normalizeDispatchLaborMinutes(...args) { return planningCoreService.normalizeDispatchLaborMinutes(...args); }
function normalizeDispatchExecutorCount(...args) { return planningCoreService.normalizeDispatchExecutorCount(...args); }
function normalizeDispatchLaborSource(...args) { return planningCoreService.normalizeDispatchLaborSource(...args); }
function normalizePlanningCorrection(...args) { return planningCoreService.normalizePlanningCorrection(...args); }
function normalizeWarehouseQuantity(...args) { return planningCoreService.normalizeWarehouseQuantity(...args); }
function removeCanceledRouteGanttSlots(...args) { return planningCoreService.removeCanceledRouteGanttSlots(...args); }
function getWorkCenterUnitsPerHour(...args) { return planningCoreService.getWorkCenterUnitsPerHour(...args); }
function normalizeQuantity(...args) { return planningCoreService.normalizeQuantity(...args); }
function normalizeBoardsPerPanel(...args) { return planningCoreService.normalizeBoardsPerPanel(...args); }
function workCenterUsesPanelBatching(...args) { return planningCoreService.workCenterUsesPanelBatching(...args); }
function getSpecificationItemBoardsPerPanel(...args) { return planningCoreService.getSpecificationItemBoardsPerPanel(...args); }
function getRouteStepBoardsPerPanel(...args) { return planningCoreService.getRouteStepBoardsPerPanel(...args); }
function toSlotDateTime(...args) { return planningCoreService.toSlotDateTime(...args); }
function getRuntimePlanningState(...args) { return planningCoreService.getRuntimePlanningState(...args); }
function getRuntimeDirectoryState(...args) { return planningCoreService.getRuntimeDirectoryState(...args); }
function getDurationWorkCenter(...args) { return planningCoreService.getDurationWorkCenter(...args); }
function getDurationResourcesForWorkCenter(...args) { return planningCoreService.getDurationResourcesForWorkCenter(...args); }
function isSmtOperationWorkCenter(...args) { return planningCoreService.isSmtOperationWorkCenter(...args); }
function getDefaultOperationCalculationType(...args) { return planningCoreService.getDefaultOperationCalculationType(...args); }
function normalizeRouteStepCalculationFields(...args) { return planningCoreService.normalizeRouteStepCalculationFields(...args); }
function getDurationOperationContext(...args) { return planningCoreService.getDurationOperationContext(...args); }
function getOperationSetupMs(...args) { return planningCoreService.getOperationSetupMs(...args); }
function getDurationBomList(...args) { return planningCoreService.getDurationBomList(...args); }
function getDurationComponentTypes(...args) { return planningCoreService.getDurationComponentTypes(...args); }
function getDurationComponentCounts(...args) { return planningCoreService.getDurationComponentCounts(...args); }
function parseCapacityCount(...args) { return planningCoreService.parseCapacityCount(...args); }
function getWorkCenterManualCapacity(...args) { return planningCoreService.getWorkCenterManualCapacity(...args); }
function calculateManualLaborDurationMs(...args) { return planningCoreService.calculateManualLaborDurationMs(...args); }
function calculateNormativeSerialDurationMs(...args) { return planningCoreService.calculateNormativeSerialDurationMs(...args); }
function calculateRateDurationMs(...args) { return planningCoreService.calculateRateDurationMs(...args); }
function normalizePlanningLaborPositiveNumber(...args) { return planningCoreService.normalizePlanningLaborPositiveNumber(...args); }
function calculatePlanningOrderLaborDurationMs(...args) { return planningCoreService.calculatePlanningOrderLaborDurationMs(...args); }
function calculateRequiredDurationMs(...args) { return planningCoreService.calculateRequiredDurationMs(...args); }
function calculatePlannedEndByQuantity(...args) { return planningCoreService.calculatePlannedEndByQuantity(...args); }
function calculateQuantityByDuration(...args) { return planningCoreService.calculateQuantityByDuration(...args); }
function getSlotEffectiveOperationContext(...args) { return planningCoreService.getSlotEffectiveOperationContext(...args); }
function getSlotRequiredDurationMs(...args) { return planningCoreService.getSlotRequiredDurationMs(...args); }
function recalculateSlotEndByQuantity(...args) { return planningCoreService.recalculateSlotEndByQuantity(...args); }
function applyPlanningOrderLaborToSlot(...args) { return planningCoreService.applyPlanningOrderLaborToSlot(...args); }
function applyRecalculatedSlotTiming(...args) { return planningCoreService.applyRecalculatedSlotTiming(...args); }
function rescheduleSlotsForWorkCenterCalendarChange(...args) { return planningCoreService.rescheduleSlotsForWorkCenterCalendarChange(...args); }
function rescheduleAllGanttSlotsByCurrentCalendars(...args) { return planningCoreService.rescheduleAllGanttSlotsByCurrentCalendars(...args); }
function getRouteBufferMs(...args) { return planningCoreService.getRouteBufferMs(...args); }
function getWorkCenterCapacity(...args) { return planningCoreService.getWorkCenterCapacity(...args); }
function getSlotStepOrder(...args) { return planningCoreService.getSlotStepOrder(...args); }
function getSlotRouteTaskId(...args) { return planningCoreService.getSlotRouteTaskId(...args); }
function getOrderedPlanningOrderSlots(...args) { return planningCoreService.getOrderedPlanningOrderSlots(...args); }
function getRouteNeighbor(...args) { return planningCoreService.getRouteNeighbor(...args); }
function getRoutePlanningOrderSlots(...args) { return planningCoreService.getRoutePlanningOrderSlots(...args); }
function normalizeRouteFlowLaunchMode(...args) { return planningCoreService.normalizeRouteFlowLaunchMode(...args); }
function getPlanningTransferBatchQuantity(...args) { return planningCoreService.getPlanningTransferBatchQuantity(...args); }
function getRouteFlowLaunchSettings(...args) { return planningCoreService.getRouteFlowLaunchSettings(...args); }
function getRouteBranchCompletionSlots(...args) { return planningCoreService.getRouteBranchCompletionSlots(...args); }
function getSlotReadyAtQuantity(...args) { return planningCoreService.getSlotReadyAtQuantity(...args); }
function getSlotProducedQuantityAt(...args) { return planningCoreService.getSlotProducedQuantityAt(...args); }
function getSlotSystemTransferEvent(...args) { return planningCoreService.getSlotSystemTransferEvent(...args); }
function getRoutePlanningOrderWipBranchDetails(...args) { return planningCoreService.getRoutePlanningOrderWipBranchDetails(...args); }
function getRoutePlanningOrderAvailableKitCount(...args) { return planningCoreService.getRoutePlanningOrderAvailableKitCount(...args); }
function getMainRouteDependencyReadiness(...args) { return planningCoreService.getMainRouteDependencyReadiness(...args); }
function getMainRouteDependencyReadyAt(...args) { return planningCoreService.getMainRouteDependencyReadyAt(...args); }
function alignMainRouteSlotsAfterBranches(...args) { return planningCoreService.alignMainRouteSlotsAfterBranches(...args); }
function alignRouteMainSlotsAfterBranches(...args) { return planningCoreService.alignRouteMainSlotsAfterBranches(...args); }
function getGanttChainKey(...args) { return planningCoreService.getGanttChainKey(...args); }
function getGanttWorkOrderKey(...args) { return planningCoreService.getGanttWorkOrderKey(...args); }
function buildGanttChainCompactionGroups(...args) { return planningCoreService.buildGanttChainCompactionGroups(...args); }
function compactVisibleGanttChains(...args) { return planningCoreService.compactVisibleGanttChains(...args); }
function getGanttOptimizationWorkOrders(...args) { return planningCoreService.getGanttOptimizationWorkOrders(...args); }
function getEarliestRouteStart(...args) { return planningCoreService.getEarliestRouteStart(...args); }
function getPlannedStepIds(...args) { return planningCoreService.getPlannedStepIds(...args); }
function buildBacklogItems(...args) { return planningCoreService.buildBacklogItems(...args); }
function windowsOverlap(...args) { return planningCoreService.windowsOverlap(...args); }
function isWindowAvailable(...args) { return planningCoreService.isWindowAvailable(...args); }
function findFreeWindow(...args) { return planningCoreService.findFreeWindow(...args); }
function getGanttSnapMs(...args) { return planningCoreService.getGanttSnapMs(...args); }
function normalizeGanttZoom(...args) { return planningCoreService.normalizeGanttZoom(...args); }
function getGanttZoomIndex(...args) { return planningCoreService.getGanttZoomIndex(...args); }
function getGanttZoomPercent(...args) { return planningCoreService.getGanttZoomPercent(...args); }
function setGanttZoom(...args) { return planningCoreService.setGanttZoom(...args); }
function normalizeGanttSlotContent(...args) { return planningCoreService.normalizeGanttSlotContent(...args); }
function getGanttSlotContentMode(...args) { return planningCoreService.getGanttSlotContentMode(...args); }
function buildGanttScaleInfo(...args) { return planningCoreService.buildGanttScaleInfo(...args); }
function getGanttSnapScaleInfo(...args) { return planningCoreService.getGanttSnapScaleInfo(...args); }
function getGanttSnapWidth(...args) { return planningCoreService.getGanttSnapWidth(...args); }
function getGanttDependencyArrowLength(...args) { return planningCoreService.getGanttDependencyArrowLength(...args); }
function getGanttDependencyEntryWidth(...args) { return planningCoreService.getGanttDependencyEntryWidth(...args); }
function getTimelineCount(...args) { return planningCoreService.getTimelineCount(...args); }
function getEarliestPlannedSlotStart(...args) { return planningCoreService.getEarliestPlannedSlotStart(...args); }
function getGanttWindowAnchorForSlot(...args) { return planningCoreService.getGanttWindowAnchorForSlot(...args); }
function alignGanttWindowToPlan(...args) { return planningCoreService.alignGanttWindowToPlan(...args); }
function getVisiblePlanningProjects(...args) { return planningCoreService.getVisiblePlanningProjects(...args); }
function getVisibleGanttRoutes(...args) { return planningCoreService.getVisibleGanttRoutes(...args); }
function isGanttRouteExpanded(...args) { return planningCoreService.isGanttRouteExpanded(...args); }
function areAllVisibleProjectsExpanded(...args) { return planningCoreService.areAllVisibleProjectsExpanded(...args); }
function extendTimelineIfNeeded(...args) { return planningCoreService.extendTimelineIfNeeded(...args); }
function prependTimelineIfNeeded(...args) { return planningCoreService.prependTimelineIfNeeded(...args); }
function cascadeBatchFromSlot(...args) { return planningCoreService.cascadeBatchFromSlot(...args); }
function cascadeIfEnabled(...args) { return planningCoreService.cascadeIfEnabled(...args); }
function getProjectDeadlineState(...args) { return planningCoreService.getProjectDeadlineState(...args); }
function resetRemovedGanttFilters(...args) { return planningCoreService.resetRemovedGanttFilters(...args); }
function initializePlanningCoreServiceModule() {
  planningCoreService = createPlanningCoreServiceModule({
  APP_VERSION,
  AUTH_GATE_DEFAULT_MODULE,
  AUTH_GATE_MAX_ATTEMPTS,
  AUTH_GATE_SESSION_STORAGE_KEY,
  BOM_COMPONENT_FIELDS,
  DAY_MS,
  DEFAULT_COMPONENT_TYPES,
  DEFAULT_INTERFACE_ROLE_ID,
  DEFAULT_ROUTE_BUFFER_MS,
  DISPATCH_FACT_STATUS_OPTIONS,
  EMPLOYEE_DEPARTMENT_MIGRATION,
  GANTT_DEPENDENCY_ARROW_LENGTH_MS,
  GANTT_DEPENDENCY_ENTRY_MS,
  GANTT_DEPENDENCY_ROUTE_VERSION,
  GANTT_SLOT_CONTENT_MODES,
  GANTT_SNAP_MS,
  GANTT_ZOOM_LEVELS,
  LEFT_WIDTH,
  LEGACY_DEPARTMENT_TO_WORK_CENTER_ID,
  LEGACY_WORK_CENTER_NAME_MIGRATION,
  MAIN_ROUTE_TASK_ID,
  MES_ADMIN_RUNTIME_HOSTS,
  MES_LEGACY_WORK_CENTER_ID_MAP,
  MES_LEGACY_WORK_CENTER_NAME_MAP,
  MES_OBSOLETE_WORK_CENTER_IDS,
  MES_OPERATION_MAP,
  MES_SIGNAL_TYPES,
  MES_SMT_WORK_CENTER_IDS,
  MIN_OPERATION_DURATION_MS,
  PRODUCTION_RESOURCE_TYPE_LABELS,
  REMOVED_DIRECTORY_STATUS_ID_PREFIXES,
  SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES,
  SHIFT_MASTER_BOARD_FOCUS_MODES,
  SHIFT_MASTER_BOARD_LANES,
  SHIFT_MASTER_BOARD_RISK_REASONS,
  SHIFT_MASTER_BOARD_SWIMLANES,
  STARTUP_SLOT_COMPARE_FIELDS,
  TIMELINE_LOAD_CHUNK,
  TIMELINE_MAX_COUNT,
  UI_STORAGE_KEY,
  addMs,
  app,
  arraysHaveSameFields,
  buildTimeScale,
  byId,
  cancelAuthPrototypePinFeedback: (...args) => typeof cancelAuthPrototypePinFeedback === "function" ? cancelAuthPrototypePinFeedback(...args) : undefined,
  createDefaultDirectoryState,
  defaultUiState,
  escapeHtml,
  formatDuration,
  fromDateInput,
  getAccessRoleById,
  getBatch,
  getDefaultSecondsPerPanel,
  getDefaultStatusRegistryKind, getDefaultSmtLineConfigurations: (...args) => typeof getDefaultSmtLineConfigurations === "function" ? getDefaultSmtLineConfigurations(...args) : [],
  getGanttSlotStatusView,
  getModuleDefinitions,
  getOperationMapItem,
  getPlanningOrderObjectLabel,
  getPlanningRouteQuantity,
  getProductionContexts,
  getProductionStructureResources, getResourcesForWorkCenter: (...args) => typeof getResourcesForWorkCenter === "function" ? getResourcesForWorkCenter(...args) : [],
  getProductionStructureMatrixRuntimeOverrides: (...args) => getProductionStructureMatrixRuntimeOverrides(...args),
  getProductionStructureWorkCenters,
  getProject,
  getProjectDisplayName,
  getRouteConcreteTasksForPlanning,
  getRouteForStep,
  getRoutePlanningBatches,
  getRoutePlanningContext,
  getRoutePlanningOrder,
  getRouteProductionId,
  getRouteStepEffectiveOperationContext,
  getRouteStepPlanningTask,
  getRouteStepQuantityForBatch,
  getRouteStepTaskId,
  getRouteStepsForModule,
  getRouteTaskInputObjectLabel,
  getRouteTaskProducedObjectLabel,
  getSchedulableRouteSteps,
  getSharedUiSignature,
  getSmtLineConfigurations: (...args) => typeof getSmtLineConfigurations === "function" ? getSmtLineConfigurations(...args) : [],
  getSmtLineNumberFromText: (...args) => typeof getSmtLineNumberFromText === "function" ? getSmtLineNumberFromText(...args) : 0,
  getShiftMasterEmployeeRows,
  getShiftMasterProfiles,
  getSlotOperationFlow,
  getSpecificationStructureItems,
  getStatusLifecycleModules,
  getWorkCenter,
  getWorkOrderPlanningStatusValue: (route = {}) => { const rawStatus = String(route?.planningStatus || "").trim(); return WORK_ORDER_PLANNING_STATUS_VALUES.has(rawStatus) ? rawStatus : "queued"; },
  icon,
  isGanttSlotCompleted: (slot = {}) => slot?.status === "completed" || slot?.completed === true,
  isShiftExecutionServerAuthoritative,
  isWorkOrderPlanningCanceled: (route = {}) => { const rawStatus = String(route?.planningStatus || "").trim(); return rawStatus === "canceled"; },
  isoLocal,
  makeId,
  markSharedUiDirty,
  normalizeAccessRoleAssignments,
  normalizeAccessRoleProfiles,
  normalizeInterfaceRoleId,
  normalizeRouteStepFlowItems,
  normalizeSpecificationStructureItem,
  normalizeStatusApplicationArea,
  normalizeStatusImpactText,
  parseJsonObject,
  pendingSaveFeedback,
  persistDirectoryState,
  persistState,
  pruneRouteStepsOutsideCurrentRouteTasks,
  render,
  resetAuthPrototypePinEntry: () => {
    authPrototypePinDraft = "";
    authPrototypeKeypadDigits = [];
  },
  routeMatchesGanttFilters: (...args) => ganttRuntime?.isReady?.() ? routeMatchesGanttFilters(...args) : true,
  saveFeedbackTimer,
  saveUxRefreshTimer,
  scaleConfig,
  scheduleSharedStatePush,
  sharedStateApplyingRemote,
  sharedStateStatus,
  snapDate,
  startOfDay,
  startOfWeek,
  toDate,
  toDateInput,
  getUi: () => ui,
  setUi: (nextState) => { ui = nextState; },
  getPlanningState: () => planningState,
  setPlanningState: setPlanningStateAndInvalidate,
  getDirectoryState: () => directoryState,
  setDirectoryState: (nextState) => { directoryState = nextState; },
  });
}

function renderUiAppShell({ pageId, className = "", body = "", modals = "", blueprint = null }) {
  const authGateActive = pageId === "authPrototype" && !isAuthGateUnlocked();
  const authStandalone = pageId === "authPrototype";
  const adminStandalone = isAdminRuntimeHost() && pageId === "contourAdmin";
  return `
    <main class="${escapeAttribute(joinUiClasses("app-shell", authStandalone ? "is-auth-standalone" : "", adminStandalone ? "is-admin-standalone" : "", authGateActive ? "is-auth-gate" : "", className))}" data-layout="app-shell" data-layout-page="${escapeAttribute(pageId)}" data-ui-component="AppShell" ${blueprint ? `data-module-blueprint="${escapeAttribute(blueprint.id)}" data-ui-pattern="${escapeAttribute(blueprint.layout.pattern)}"` : ""}>
      ${authStandalone || adminStandalone ? "" : renderModuleMenu()}
      ${authStandalone || adminStandalone ? "" : renderAppTopbar()}
      ${body}
      ${modals}
    </main>
  `;
}

function initializeModuleRuntime() {
  const coreAdapters = {
    directories: {
      render: () => {
        hydrateSharedStateForModule("directories", [DIRECTORY_STORAGE_KEY]);
        ensureRoutesRenderModule();
        if (routesRenderModuleError) {
          return renderMesModulePatternPage({
            moduleId: "directories",
            content: renderUiEmptyState({ title: "Не удалось загрузить модуль", description: "Обновите страницу. Если ошибка повторится, передайте время появления в поддержку." }),
          });
        }
        const directoryReactHosts = {
          componentTypes: directoryComponentTypesReactIslandHost,
          operations: directoryOperationsReactIslandHost,
          nomenclatureTypes: directoryNomenclatureTypesReactIslandHost,
          statuses: directoryStatusesReactIslandHost,
        };
        const activeReactHost = directoryReactHosts[normalizeDirectorySectionId(ui.activeDirectory)];
        Object.values(directoryReactHosts).forEach((host) => {
          if (host !== activeReactHost) host.prepareRender();
        });
        const reactDecision = activeReactHost?.prepareRender();
        if (reactDecision?.activateReact) return activeReactHost.renderTarget();
        return renderDirectoryPage();
      },
      bind: () => {
        if (directoryComponentTypesReactIslandHost.isReactEligible() || directoryOperationsReactIslandHost.isReactEligible() || directoryNomenclatureTypesReactIslandHost.isReactEligible() || directoryStatusesReactIslandHost.isReactEligible()) return;
        bindDirectoryEvents();
      },
      afterRender: () => {
        void directoryComponentTypesReactIslandHost.mount();
        void directoryOperationsReactIslandHost.mount();
        void directoryNomenclatureTypesReactIslandHost.mount();
        void directoryStatusesReactIslandHost.mount();
      },
    },
    specifications2: {
      render: () => {
        ensureSpecifications2Module();
        const reactDecision = specifications2ReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return specifications2ReactIslandHost.renderTarget();
        return renderSpecifications2Page();
      },
      bind: () => { if (!specifications2ReactIslandHost.isReactEligible()) bindSpecifications2Events(); },
      afterRender: () => { void specifications2ReactIslandHost.mount(); },
    },
    authPrototype: {
      render: () => {
        // Authentication is itself a System Domains consumer.  It must not
        // wait for the shared-state startup handshake after that projection
        // has been retired: read departments, employees and roles directly
        // from PostgreSQL and re-render this exact module on completion.
        if (systemDomainsServerReadState.status !== "server") {
          void hydrateSystemDomainsServerRead("authPrototype", { fallbackToLegacy: false });
        }
        ensureAuthModules();
        const reactDecision = authPickerReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return authPickerReactIslandHost.renderTarget();
        return renderAuthPrototypePage();
      },
      bind: () => { if (!authPickerReactIslandHost.isReactEligible()) bindAuthPrototypeEvents(); },
      afterRender: () => { void authPickerReactIslandHost.mount(); },
    },
    authSessionPrototype: {
      render: () => {
        if (systemDomainsServerReadState.status !== "server") {
          void hydrateSystemDomainsServerRead("authSessionPrototype", { fallbackToLegacy: false });
        }
        ensureAuthModules();
        ensureShiftMasterBoardModule();
        // A direct Employee Desktop entry needs the same complete Planning
        // graph as the Master Board before it can derive a bounded dispatch
        // scope. The PostgreSQL projection is the source of those task rows.
        if (planningRuntimeProjectionState.status === "idle") void hydratePlanningRuntimeProjection();
        // The employee desktop consumes the same PostgreSQL assignment/fact
        // projection as the Master Board.  Hydrate it before treating the
        // retired browser maps as an authoritative empty task list.
        if (typeof getShiftMasterBoardModel === "function") hydrateShiftExecutionServerProjection();
        const reactDecision = employeeDesktopReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return employeeDesktopReactIslandHost.renderTarget();
        return renderAuthSessionPrototypePage();
      },
      renderModals: () => renderAuthSessionModal(),
      bind: () => {
        if (employeeDesktopReactIslandHost.isReactEligible()) return;
        bindAuthPrototypeEvents();
        bindAuthSessionEvents();
      },
      afterRender: () => { void employeeDesktopReactIslandHost.mount(); },
    },
    marking: {
      render: () => {
        const reactDecision = markingReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return markingReactIslandHost.renderTarget();
        return renderMesModulePatternPage({
          moduleId: "marking",
          header: { eyebrow: "Оперативное управление", title: "Маркировка" },
          content: renderUiEmptyState({ title: "Демо-модуль временно недоступен", description: "Вернитесь к предыдущему релизу или обновите страницу." }),
        });
      },
      bind: () => {},
      afterRender: () => { void markingReactIslandHost.mount(); },
    },
    weeklyProductionControl: {
      initialize: () => getWeeklyProductionControlRuntimeInstance(),
      publicPorts: [
        "formatWeeklyProductionControlPercent",
        "formatWeeklyProductionControlQuantity",
        "getWeeklyProductionControlModel",
      ],
      render: (instance) => {
        ensureProductionStructureMatrixModule();
        const waitingForScheduledReadRetry = Boolean(
          (weeklyPlanningPeriodState.error || weeklyPlanningPeriodState.fallbackReason)
          && weeklyPlanningPeriodRefreshTimer !== null,
        );
        if (!waitingForScheduledReadRetry) hydrateWeeklyPlanningPeriod();
        const reactDecision = weeklyProductionControlReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return weeklyProductionControlReactIslandHost.renderTarget();
        return instance.renderWeeklyProductionControlPage();
      },
      bind: (instance) => {
        if (weeklyProductionControlReactIslandHost.isReactEligible()) return;
        instance.bindWeeklyProductionControlEvents();
      },
      afterRender: () => { void weeklyProductionControlReactIslandHost.mount(); },
    },
    productionStructureMatrix: {
      render: () => {
        if (systemDomainsServerReadState.status === "idle" || (systemDomainsServerReadState.status === "fallback" && systemDomainsServerReadRetryTimer === null)) {
          void hydrateSystemDomainsServerRead("productionStructureMatrix", { fallbackToLegacy: false });
        }
        ensureProductionStructureMatrixModule();
        const activeReactHost = getActiveProductionStructureReactHost();
        Object.values(productionStructureReactHosts).forEach((host) => { if (host !== activeReactHost) host.prepareRender(); });
        const reactDecision = activeReactHost.prepareRender();
        if (reactDecision.activateReact) return activeReactHost.renderTarget();
        return renderProductionStructureMatrixPage();
      },
      bind: () => {
        if (getActiveProductionStructureReactHost().isReactEligible()) return;
        bindProductionStructureMatrixEvents();
      },
      afterRender: () => { void structureEmployeesReactIslandHost.mount(); void structurePositionsReactIslandHost.mount(); void structureOrgUnitsReactIslandHost.mount(); void structureWorkCentersReactIslandHost.mount(); void structureEquipmentReactIslandHost.mount(); void structureResponsibilityPoliciesReactIslandHost.mount(); void structureMigrationDiagnosticsReactIslandHost.mount(); },
    },
    timesheet: {
      render: () => {
        if (systemDomainsServerReadState.status !== "server") {
          void hydrateSystemDomainsServerRead("timesheet", { fallbackToLegacy: false });
        }
        ensureProductionStructureMatrixModule();
        ensureTimesheetModule();
        const reactDecision = timesheetReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return timesheetReactIslandHost.renderTarget();
        return renderTimesheetPage();
      },
      renderModals: () => renderTimesheetEditorModal(),
      bind: () => { if (!timesheetReactIslandHost.isReactEligible()) bindTimesheetEvents(); },
      afterRender: () => { void timesheetReactIslandHost.mount(); },
    },
    roles: {
      render: () => {
        if (systemDomainsServerReadState.status !== "server") {
          void hydrateSystemDomainsServerRead("roles", { fallbackToLegacy: false });
        }
        ensureAccessRolesModule();
        const reactDecision = rolesReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return rolesReactIslandHost.renderTarget();
        return renderAccessRolesPage();
      },
      bind: () => {
        if (rolesReactIslandHost.isReactEligible()) return;
        bindAccessRolesEvents();
      },
      afterRender: () => { void rolesReactIslandHost.mount(); },
    },
    contourAdmin: {
      render: () => {
        ensureContourAdminModule();
        const reactDecision = contourAdminReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return contourAdminReactIslandHost.renderTarget();
        return renderContourAdminPage();
      },
      bind: () => { if (!contourAdminReactIslandHost.isReactEligible()) bindContourAdminEvents(); },
      afterRender: () => { void contourAdminReactIslandHost.mount(); },
    },
    nomenclature: {
      render: () => {
        const permanentNomenclatureRuntime = getReactRuntimeMode("nomenclature") === "react";
        hydrateSharedStateForModule("nomenclature", [DIRECTORY_STORAGE_KEY], {
          allowBeforeInitialSync: permanentNomenclatureRuntime,
          failClosed: permanentNomenclatureRuntime,
        });
        void ensureNomenclatureRenderModule();
        const useBoardsHost = ui.activeNomenclaturePane === "boards";
        const activeReactHost = useBoardsHost ? boardsReactIslandHost : nomenclatureReactIslandHost;
        const inactiveReactHost = useBoardsHost ? nomenclatureReactIslandHost : boardsReactIslandHost;
        inactiveReactHost.prepareRender();
        const reactDecision = activeReactHost.prepareRender();
        if (reactDecision.activateReact) return activeReactHost.renderTarget();
        return renderNomenclaturePage();
      },
      bind: () => {
        if (nomenclatureReactIslandHost.isReactEligible() || boardsReactIslandHost.isReactEligible()) return;
        bindNomenclatureEvents();
        bindBomListsEvents();
      },
      afterRender: () => {
        if (ui.activeNomenclaturePane === "boards") void boardsReactIslandHost.mount();
        else void nomenclatureReactIslandHost.mount();
      },
    },
    planning: {
      render: () => {
        hydratePlanningWorkOrderReadModel();
        ensurePlanningWorkbenchModule();
        if (planningWorkbenchModuleError) {
          return renderPlanningWorkbenchShellState({
            title: "Не удалось загрузить заказ-наряды",
            description: "Обновите страницу. Если ошибка повторится, передайте время появления в поддержку.",
          });
        }
        const reactDecision = planningWorkbenchReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return planningWorkbenchReactIslandHost.renderTarget();
        return renderPlanningWorkbenchPage();
      },
      bind: () => { if (!planningWorkbenchReactIslandHost.isReactEligible()) bindPlanningEvents(); },
      afterRender: () => { schedulePlanningRouteStructureSidebarSync(); void planningWorkbenchReactIslandHost.mount(); },
    },
    shiftMasterBoard: {
      render: () => {
        if (systemDomainsServerReadState.status !== "server") {
          void hydrateSystemDomainsServerRead("shiftMasterBoard", { fallbackToLegacy: false });
        }
        ensureShiftMasterBoardModule();
        // The board is lazy-loaded.  Its own render cycle follows module
        // initialization, so scope the server read only after the board can
        // tell us which durable rows are actually on the current shift.
        if (typeof getShiftMasterBoardModel === "function") hydrateShiftExecutionServerProjection();
        if (shiftMasterBoardModuleError) {
          return renderShiftMasterBoardShellState({
            title: "Не удалось загрузить мастерскую",
            description: "Обновите страницу. Если ошибка повторится, передайте время появления в поддержку.",
          });
        }
        const reactDecision = shiftMasterBoardReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return shiftMasterBoardReactIslandHost.renderTarget();
        return renderShiftMasterBoardPage();
      },
      renderModals: () => `${renderShiftMasterBoardSheetModal()}${renderShiftMasterBoardActionModal()}`,
      bind: () => { if (!shiftMasterBoardReactIslandHost.isReactEligible()) bindShiftMasterBoardEvents(); },
      afterRender: () => { void shiftMasterBoardReactIslandHost.mount(); },
    },
    shiftWorkOrders: {
      render: () => {
        if (systemDomainsServerReadState.status !== "server") {
          void hydrateSystemDomainsServerRead("shiftWorkOrders", { fallbackToLegacy: false });
        }
        ensureShiftMasterBoardModule();
        ensureShiftWorkOrdersModule();
        if (typeof getShiftMasterBoardModel === "function") hydrateShiftExecutionServerProjection();
        if (shiftWorkOrdersModuleError) {
          return renderMesModulePatternPage({
            moduleId: "shiftWorkOrders",
            content: renderUiEmptyState({ title: "Не удалось загрузить модуль", description: "Обновите страницу. Если ошибка повторится, передайте время появления в поддержку." }),
          });
        }
        const reactDecision = shiftWorkOrdersReactIslandHost.prepareRender();
        if (reactDecision.activateReact) return shiftWorkOrdersReactIslandHost.renderTarget();
        return renderShiftWorkOrdersPage();
      },
      renderModals: () => `${renderShiftWorkOrderPrintPreviewModal()}${renderShiftWorkOrderIssuePhotoModal()}${renderWorkOrderPrintPackageModal()}`,
      bind: () => { if (!shiftWorkOrdersReactIslandHost.isReactEligible()) bindShiftWorkOrdersEvents(); },
      afterRender: () => { void shiftWorkOrdersReactIslandHost.mount(); },
    },
  };
  const prototypeAdapters = createGeneratedModuleRuntimeAdapters({
    renderMesModulePatternPage,
    renderUiPanel,
    renderUiPanelBody,
    renderUiSystemState,
  });
  moduleRuntime = createMesModuleRuntime({
    blueprints: MES_MODULE_BLUEPRINT_REGISTRY,
    adapters: { ...coreAdapters, ...prototypeAdapters },
    renderAppShell: (options) => { app.innerHTML = renderUiAppShell(options); },
    renderSharedModals: () => renderConfirmModal(),
    bindGlobalNavigation: () => bindGlobalNavigation(),
    bindSharedEvents: () => bindConfirmEvents(),
  });
}

function markUiComponent(selector, componentName) {
  app.querySelectorAll(selector).forEach((element) => {
    if (!element.dataset.uiComponent) element.dataset.uiComponent = componentName;
  });
}

function applyUiTableScrollContract(selector) {
  app.querySelectorAll(selector).forEach((element) => {
    if (!element.dataset.scrollContract) element.dataset.scrollContract = "horizontal-only";
  });
}

function applyUiActionButtonContract() {
  app.querySelectorAll('[data-ui-component="ActionButton"]').forEach((element) => {
    const domainScope = element.closest('[data-ui-action-scope^="domain:"]');
    const domainScopeName = String(domainScope?.dataset.uiActionScope || "").replace(/^domain:/, "") || "control";
    if (!element.dataset.uiTone) {
      element.dataset.uiTone = domainScope
        ? "domain"
        : element.classList.contains("danger-primary")
        || element.classList.contains("danger")
        || element.classList.contains("danger-soft")
        ? "danger"
        : element.classList.contains("table-icon-button")
          ? "table-icon"
          : element.classList.contains("icon-button")
            ? "icon"
            : element.classList.contains("primary-button")
              ? "primary"
              : element.classList.contains("is-ghost")
                ? "ghost"
                : element.classList.contains("ui-action-button")
                  ? "secondary"
                  : "domain";
    }
    if (!element.dataset.uiSize) {
      element.dataset.uiSize = domainScope
        ? "domain"
        : element.classList.contains("table-icon-button")
        ? "table-icon"
        : element.classList.contains("icon-button")
          ? "icon"
          : element.classList.contains("is-touch")
            ? "touch"
            : element.classList.contains("is-compact")
              ? "compact"
              : element.classList.contains("ui-action-button")
                ? "default"
                  : "domain";
    }
    if (!element.dataset.uiVariant) {
      const domainClass = [...element.classList].find((className) => ![
        "ui-action-button",
        "primary-button",
        "secondary-button",
        "icon-button",
        "table-icon-button",
      ].includes(className));
      element.dataset.uiVariant = element.dataset.uiTone === "domain"
        ? `domain:${domainScope ? `${domainScopeName}:` : ""}${domainClass || "control"}`
        : `${element.dataset.uiTone}:${element.dataset.uiSize}`;
    }
  });
}

function applyUiDomainFieldContract() {
  app.querySelectorAll('[data-ui-component="DomainField"]').forEach((element) => {
    if (element.dataset.uiVariant) return;
    const domainClass = [...element.classList].find((className) => ![
      "field",
      "form-field",
      "ui-form-field",
    ].includes(className));
    element.dataset.uiVariant = `domain:${domainClass || "field"}`;
  });
}

function applyUiRuntimeContracts() {
  if (!app?.isConnected) return;
  UI_RUNTIME_DOM_NORMALIZER_CONTRACTS.forEach(({ selector, component }) => {
    markUiComponent(selector, component);
  });
  applyUiActionButtonContract();
  applyUiDomainFieldContract();
  UI_RUNTIME_TABLE_SCROLL_SELECTORS.forEach((selector) => {
    applyUiTableScrollContract(selector);
  });
}

function isPerformanceQaMode() {
  return new URLSearchParams(window.location.search).get("qa") === "boot-performance";
}

function render(options = {}) {
  mesRenderDepth += 1;
  try {
    return renderCurrentModule(options);
  } finally {
    mesRenderDepth = Math.max(0, mesRenderDepth - 1);
  }
}

function renderCurrentModule(options = {}) {
  const renderStartedAt = isPerformanceQaMode() ? performance.now() : 0;
  const renderProfile = [];
  const recordRenderPhase = (name, startedAt) => {
    if (!renderStartedAt) return;
    renderProfile.push({
      name,
      ms: Number((performance.now() - startedAt).toFixed(2)),
    });
  };
  if (!options.skipRememberScroll) rememberScroll();
  const moduleScrollSnapshot = options.skipModuleScrollRestore ? null : getModuleScrollSnapshot();
  try {
    const preparationStartedAt = renderStartedAt ? performance.now() : 0;
    syncUiWithUrlParams();
    ensureAuthGateModule();
    ensureAuthorizedModule();
    noteGanttPlanningProjectionModuleEntry();
    resetRemovedGanttFilters();
    persistUiState({ skipRememberScroll: options.skipRememberScroll });
    scheduleGlobalSaveUxRefresh();
    recordRenderPhase("preparation", preparationStartedAt);

    if (!moduleRuntime) throw new Error("MES module runtime is not initialized.");
    const moduleRuntimeStartedAt = renderStartedAt ? performance.now() : 0;
    const runtimeResult = moduleRuntime.renderModule(ui.activeModule);
    recordRenderPhase("module runtime", moduleRuntimeStartedAt);
    if (runtimeResult.handled) {
      return;
    }

    if (ui.activeModule !== "gantt") {
      throw new Error(`Special MES module has no explicit runtime renderer: ${ui.activeModule}`);
    }

    void ensureGanttPlanningRuntimeProjection();

    if (!hasGanttPlanningProjectionReady()) {
      const fallbackUnavailable = planningRuntimeProjectionState.status === "fallback"
        && sharedStateStatus.enabled
        && ganttPlanningFallbackAttempted;
      app.innerHTML = renderUiAppShell({
        pageId: "gantt",
        className: "planning-app-shell planning-gantt-shell",
        blueprint: getMesModuleBlueprintDefinition("gantt"),
        body: renderUiEmptyState({
          title: fallbackUnavailable ? "Не удалось подготовить график" : "Загружаем график",
          description: fallbackUnavailable
            ? "Серверный план и резервная копия сейчас недоступны. Обновите страницу и повторите попытку."
            : "Получаем актуальный производственный план.",
        }),
      });
      bindGlobalNavigation();
      return;
    }

    if (!ganttRuntime.isReady()) {
      void ganttRuntime.load()
        .then(() => render({ skipRememberScroll: true }))
        .catch((error) => {
          console.error("[MES] Gantt runtime failed to load", error);
          app.innerHTML = renderUiAppShell({
            pageId: "gantt",
            className: "planning-app-shell planning-gantt-shell",
            blueprint: getMesModuleBlueprintDefinition("gantt"),
            body: renderUiEmptyState({
              title: "Не удалось загрузить график",
              description: "Обновите страницу. Если ошибка повторится, передайте время появления в поддержку.",
            }),
          });
          bindGlobalNavigation();
        });
      app.innerHTML = renderUiAppShell({
        pageId: "gantt",
        className: "planning-app-shell planning-gantt-shell",
        blueprint: getMesModuleBlueprintDefinition("gantt"),
        body: renderUiEmptyState({
          title: "Загружаем график",
          description: "Подготавливаем производственный план.",
        }),
      });
      bindGlobalNavigation();
      return;
    }

    const ganttDataStartedAt = renderStartedAt ? performance.now() : 0;
    recoverPlanningStateFromStorageIfRuntimeEmpty("gantt-render");
    const scaleStart = fromDateInput(ui.windowStart);
    const scaleInfo = buildGanttScaleInfo(ui.scale, scaleStart, getTimelineCount(ui.scale, scaleStart));
    const rows = buildRows(scaleInfo);
    const rowLayout = buildRowLayout(rows);
    const slotPlacementMap = buildSlotPlacementMap(rows, scaleInfo);
    const sharedNonWorkingIntervals = buildVisibleSharedNonWorkingIntervals(rows, scaleInfo);
    const warningsContext = getSlotWarnings(planningState);
    recordRenderPhase("gantt data model", ganttDataStartedAt);
    const ganttDomStartedAt = renderStartedAt ? performance.now() : 0;
    const ganttPlanningProjectionSource = planningRuntimeProjectionState.status === "fallback"
      ? "snapshot-fallback"
      : planningRuntimeProjectionState.status;
    ganttReactModel = getGanttReactModel(scaleInfo, rows, rowLayout, slotPlacementMap, ganttPlanningProjectionSource);
    const ganttReactDecision = ganttReactIslandHost.prepareRender();
    if (ganttReactDecision.activateReact) {
      app.innerHTML = renderUiAppShell({
        pageId: "gantt",
        className: "planning-app-shell planning-gantt-shell",
        blueprint: getMesModuleBlueprintDefinition("gantt"),
        body: ganttReactIslandHost.renderTarget(),
      });
      bindGlobalNavigation();
      void ganttReactIslandHost.mount();
      recordRenderPhase("gantt React island", ganttDomStartedAt);
      return;
    }
    app.innerHTML = renderUiAppShell({
      pageId: "gantt",
      className: "planning-app-shell planning-gantt-shell",
      blueprint: getMesModuleBlueprintDefinition("gantt"),
      body: `
        <section class="planner-workspace planner-workspace-gantt-only" data-layout="planning-page" aria-label="Рабочая область планирования">
          ${renderToolbar()}
          <section class="planner-frame" aria-label="Производственный план">
            <div class="gantt-shell ${ui.ganttDependencyEditMode ? "is-dependency-editing" : ""}" data-layout="gantt" data-gantt-shell data-ui-component="GanttRuntime" data-ui-runtime="gantt-v1" data-gantt-planning-projection-source="${escapeAttribute(ganttPlanningProjectionSource)}">
              <div class="gantt-canvas" data-ui-component="GanttCanvas" style="--left-width:${LEFT_WIDTH}px; --timeline-width:${scaleInfo.width}px; --total-height:${rowLayout.totalHeight}px;">
                ${renderTimeline(scaleInfo)}
                <div class="rows-layer" data-ui-component="GanttRowsLayer" style="top:${TIMELINE_HEIGHT}px;">
                  ${rows.map((row) => renderRow(row, rowLayout, scaleInfo, warningsContext.slotWarningMap, slotPlacementMap, sharedNonWorkingIntervals)).join("")}
                </div>
                ${renderDependencies(rows, rowLayout, scaleInfo, warningsContext.slotWarningMap, slotPlacementMap)}
                ${renderGanttSnapOverlay(rowLayout, scaleInfo, slotPlacementMap)}
              </div>
            </div>
          </section>
        </section>
        ${renderSlotDrawer(warningsContext.slotWarningMap)}
      `,
      modals: `${renderGanttOptimizationModal()}${renderEditorModal()}${renderSplitModal()}${renderConfirmModal()}`,
    });

    bindGlobalNavigation();
    bindEvents(scaleInfo, rows, rowLayout);
    bindConfirmEvents();
    restoreScroll();
    recordRenderPhase("gantt DOM and bindings", ganttDomStartedAt);
  } finally {
    const contractsStartedAt = renderStartedAt ? performance.now() : 0;
    applyUiRuntimeContracts();
    restoreModuleScrollSnapshot(moduleScrollSnapshot);
    recordRenderPhase("runtime contracts", contractsStartedAt);
    if (renderStartedAt) {
      window.__MES_RENDER_PERFORMANCE__ = {
        module: ui.activeModule,
        totalMs: Number((performance.now() - renderStartedAt).toFixed(2)),
        entries: renderProfile,
        at: new Date().toISOString(),
      };
    }
  }
}

function getModuleScrollSnapshot() {
  const selectors = [
    "[data-layout='main-content']",
    "[data-layout='page-workspace']",
    ".module-data-content",
    ".directory-workspace",
    ".planner-workspace",
    ".modal",
    ".planning-detail-body",
    "[data-layout='table']",
  ];
  const seen = new Set();
  const elements = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element, index) => ({ selector, element, index })))
    .filter(({ element }) => {
      if (!element || seen.has(element)) return false;
      seen.add(element);
      return true;
    })
    .map(({ selector, element, index }) => ({
      selector,
      index,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    }));
  const scrollingElement = document.scrollingElement || document.documentElement;
  return {
    module: ui.activeModule,
    windowX: window.scrollX || 0,
    windowY: window.scrollY || 0,
    documentLeft: scrollingElement?.scrollLeft || 0,
    documentTop: scrollingElement?.scrollTop || 0,
    elements,
  };
}

function restoreModuleScrollSnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.module && snapshot.module !== ui.activeModule) return;
  const apply = () => {
    if (snapshot.module && snapshot.module !== ui.activeModule) return;
    const scrollingElement = document.scrollingElement || document.documentElement;
    if (scrollingElement) {
      scrollingElement.scrollLeft = snapshot.documentLeft || 0;
      scrollingElement.scrollTop = snapshot.documentTop || 0;
    }
    snapshot.elements.forEach((item) => {
      const element = document.querySelectorAll(item.selector)[item.index || 0];
      if (!element) return;
      element.scrollLeft = item.scrollLeft || 0;
      element.scrollTop = item.scrollTop || 0;
    });
    window.scrollTo(snapshot.windowX || 0, snapshot.windowY || 0);
  };
  window.requestAnimationFrame(apply);
  window.setTimeout(apply, 0);
  window.setTimeout(apply, 80);
}

function renderPreservingModuleScroll(options = {}) {
  const snapshot = getModuleScrollSnapshot();
  render(options);
  restoreModuleScrollSnapshot(snapshot);
}

function refreshPlanningWorkbench() {
  // Route selection has changed without a full module render. Let the one
  // compact bootstrap load its corresponding detail; do not race it with the
  // legacy direct-detail reader.
  hydratePlanningWorkOrderReadModel();
  const currentPage = app.querySelector('.planning-order-page[data-ui-component="ModulePage"]');
  const currentWorkspace = currentPage?.querySelector(':scope > [data-ui-component="ModuleWorkspace"]');
  if (!currentPage || !currentWorkspace || ui.activeModule !== "planning") {
    renderPreservingModuleScroll();
    return false;
  }

  const template = document.createElement("template");
  template.innerHTML = String(renderPlanningWorkbenchPage() || "").trim();
  const nextPage = template.content.firstElementChild;
  const nextWorkspace = nextPage?.querySelector?.(':scope > [data-ui-component="ModuleWorkspace"]');
  if (!nextPage?.matches?.('.planning-order-page[data-ui-component="ModulePage"]') || !nextWorkspace) {
    renderPreservingModuleScroll();
    return false;
  }

  const snapshot = getModuleScrollSnapshot();
  currentPage.dataset.planningActiveRouteId = nextPage.dataset.planningActiveRouteId || "";
  currentWorkspace.replaceWith(nextWorkspace);
  bindPlanningEvents(nextWorkspace);
  applyUiRuntimeContracts();
  restoreModuleScrollSnapshot(snapshot);
  schedulePlanningRouteStructureSidebarSync();
  return true;
}

function getOperationMapRows(...args) { return operationalRuntimeService.getOperationMapRows(...args); }
function getOperationMapItem(operationId) { return typeof operationalRuntimeService.getOperationMapItem === "function" ? operationalRuntimeService.getOperationMapItem(operationId) : ([...(directoryState.operationMap || []), ...MES_OPERATION_MAP].find((row) => row.id === operationId) || null); }
function findOperationMapItemByNameAndWorkCenter(...args) { return operationalRuntimeService.findOperationMapItemByNameAndWorkCenter(...args); }
function getLegacyOperationWorkCenterId(...args) { return operationalRuntimeService.getLegacyOperationWorkCenterId(...args); }
function ensureOperationMapItemFromLegacyOperation(...args) { return operationalRuntimeService.ensureOperationMapItemFromLegacyOperation(...args); }
function applyOperationMapItemToRouteStep(...args) { return operationalRuntimeService.applyOperationMapItemToRouteStep(...args); }
function getDefaultOperationNameForWorkCenter(...args) { return operationalRuntimeService.getDefaultOperationNameForWorkCenter(...args); }
function makeDefaultOperationCode(...args) { return operationalRuntimeService.makeDefaultOperationCode(...args); }
function ensureWorkCenterOperations(...args) { return operationalRuntimeService.ensureWorkCenterOperations(...args); }
function migrateLegacyOperationsToDirectory(...args) { return operationalRuntimeService.migrateLegacyOperationsToDirectory(...args); }
function formatWarehouseQuantity(...args) { return operationalRuntimeService.formatWarehouseQuantity(...args); }
function stripWarehouseReceiptLabel(...args) { return operationalRuntimeService.stripWarehouseReceiptLabel(...args); }
function normalizeWarehouseLookupText(...args) { return operationalRuntimeService.normalizeWarehouseLookupText(...args); }
function getWarehouseNomenclatureIdByExactLabel(...args) { return operationalRuntimeService.getWarehouseNomenclatureIdByExactLabel(...args); }
function getWarehouseNomenclatureIdForRouteTask(...args) { return operationalRuntimeService.getWarehouseNomenclatureIdForRouteTask(...args); }
function getWarehouseNomenclatureIdForReceiptOutput(...args) { return operationalRuntimeService.getWarehouseNomenclatureIdForReceiptOutput(...args); }
function getWarehouseProductionReceiptNomenclatureId(...args) { return operationalRuntimeService.getWarehouseProductionReceiptNomenclatureId(...args); }
function getWarehouseProductionReceiptRows(...args) { return operationalRuntimeService.getWarehouseProductionReceiptRows(...args); }
function getWarehouseBalanceRows(...args) { return operationalRuntimeService.getWarehouseBalanceRows(...args); }
function getWarehouseBalanceForNomenclature(...args) { return operationalRuntimeService.getWarehouseBalanceForNomenclature(...args); }
function getShiftMasterProfiles(...args) { return typeof operationalRuntimeService.getShiftMasterProfiles === "function" ? operationalRuntimeService.getShiftMasterProfiles(...args) : []; }
function getShiftMasterEmployeeRows(...args) { return typeof operationalRuntimeService.getShiftMasterEmployeeRows === "function" ? operationalRuntimeService.getShiftMasterEmployeeRows(...args) : []; }
function getShiftMasterProfile(...args) { return operationalRuntimeService.getShiftMasterProfile(...args); }
function shiftMasterProfileOwnsWorkCenter(...args) { return operationalRuntimeService.shiftMasterProfileOwnsWorkCenter(...args); }
function getShiftMasterProfilesForWorkCenter(...args) { return operationalRuntimeService.getShiftMasterProfilesForWorkCenter(...args); }
function getShiftMasterProfileForPerson(...args) { return operationalRuntimeService.getShiftMasterProfileForPerson(...args); }
function getShiftMasterBoardAccessContext(...args) { return operationalRuntimeService.getShiftMasterBoardAccessContext(...args); }
function getShiftMasterEmployeesForWorkCenter(...args) { return operationalRuntimeService.getShiftMasterEmployeesForWorkCenter(...args); }
function getShiftMasterNormalizedWorkCenterId(...args) { return operationalRuntimeService.getShiftMasterNormalizedWorkCenterId(...args); }
function getShiftMasterWorkCenterCatalog(...args) { return operationalRuntimeService.getShiftMasterWorkCenterCatalog(...args); }
function getShiftMasterDescendantWorkCenterIds(...args) { return operationalRuntimeService.getShiftMasterDescendantWorkCenterIds(...args); }
function shiftMasterEmployeeMatchesWorkCenterScope(...args) { return operationalRuntimeService.shiftMasterEmployeeMatchesWorkCenterScope(...args); }
function sortShiftMasterAssignableEmployees(...args) { return operationalRuntimeService.sortShiftMasterAssignableEmployees(...args); }
function getShiftMasterAssignmentConfig(...args) { return operationalRuntimeService.getShiftMasterAssignmentConfig(...args); }
function getShiftMasterDefaultEmployeeScope(...args) { return operationalRuntimeService.getShiftMasterDefaultEmployeeScope(...args); }
function getShiftMasterAssignableEmployees(...args) { return operationalRuntimeService.getShiftMasterAssignableEmployees(...args); }
function getShiftMasterOwnerProfileForWorkCenter(...args) { return operationalRuntimeService.getShiftMasterOwnerProfileForWorkCenter(...args); }
function setShiftMasterAssignmentMatrixConfig(...args) {
  const result = operationalRuntimeService.setShiftMasterAssignmentMatrixConfig(...args);
  syncResponsibilityPolicyFromCompatibilityState(args[0]);
  return result;
}
function resetShiftMasterAssignmentMatrixConfig(...args) {
  const result = operationalRuntimeService.resetShiftMasterAssignmentMatrixConfig(...args);
  syncResponsibilityPolicyFromCompatibilityState(args[0], { archive: true });
  return result;
}
function setShiftMasterAssignmentMatrixEmployee(...args) {
  const result = operationalRuntimeService.setShiftMasterAssignmentMatrixEmployee(...args);
  syncResponsibilityPolicyFromCompatibilityState(args[0]);
  return result;
}
function getShiftMasterEmployee(...args) { return operationalRuntimeService.getShiftMasterEmployee(...args); }
function getTimesheetAvailabilityForShiftMasterEmployee(...args) { return operationalRuntimeService.getTimesheetAvailabilityForShiftMasterEmployee(...args); }
function enrichShiftMasterEmployeesWithTimesheet(...args) { return operationalRuntimeService.enrichShiftMasterEmployeesWithTimesheet(...args); }
function getShiftMasterAssignment(...args) { return operationalRuntimeService.getShiftMasterAssignment(...args); }
function getDispatchFact(...args) { return operationalRuntimeService.getDispatchFact(...args); }
function getRawGanttSlotStatusValue(...args) { return operationalRuntimeService.getRawGanttSlotStatusValue(...args); }
function getGanttSlotStatusView(...args) { return operationalRuntimeService.getGanttSlotStatusView(...args); }
function getGanttSlotStatusClass(...args) { return operationalRuntimeService.getGanttSlotStatusClass(...args); }
function isGanttSlotStatus(...args) { return operationalRuntimeService.isGanttSlotStatus(...args); }
function isGanttSlotCompleted(...args) { return operationalRuntimeService.isGanttSlotCompleted(...args); }
function isGanttSlotActive(...args) { return operationalRuntimeService.isGanttSlotActive(...args); }
function isGanttSlotRiskStatus(...args) { return operationalRuntimeService.isGanttSlotRiskStatus(...args); }
function isGanttSlotProblemStatus(...args) { return operationalRuntimeService.isGanttSlotProblemStatus(...args); }
function getWorkOrderPlanningStatusValue(...args) { return operationalRuntimeService.getWorkOrderPlanningStatusValue(...args); }
function getWorkOrderPlanningStatus(...args) { return operationalRuntimeService.getWorkOrderPlanningStatus(...args); }
function isWorkOrderPlanningCanceled(...args) { return operationalRuntimeService.isWorkOrderPlanningCanceled(...args); }
function getGanttSlotViewModel(...args) { return operationalRuntimeService.getGanttSlotViewModel(...args); }
function getShiftWorkOrderViewModel(...args) { return operationalRuntimeService.getShiftWorkOrderViewModel(...args); }
function getDispatchFactViewModel(...args) { return operationalRuntimeService.getDispatchFactViewModel(...args); }
function getDispatchFactStatusConfig(...args) { return operationalRuntimeService.getDispatchFactStatusConfig(...args); }
function getShiftWorkOrderPlannedQuantity(...args) { return operationalRuntimeService.getShiftWorkOrderPlannedQuantity(...args); }
function getShiftRowId(...args) { return operationalRuntimeService.getShiftRowId(...args); }
function getShiftSlotWindowSegment(...args) { return operationalRuntimeService.getShiftSlotWindowSegment(...args); }
function getShiftSlotPlannedQuantity(...args) { return operationalRuntimeService.getShiftSlotPlannedQuantity(...args); }
function getPlanningShiftSlotTimeLabelForWindow(...args) { return operationalRuntimeService.getPlanningShiftSlotTimeLabelForWindow(...args); }
function getShiftMasterResourceOptions(...args) { return operationalRuntimeService.getShiftMasterResourceOptions(...args); }
function getShiftRowWorkCenterId(...args) { return operationalRuntimeService.getShiftRowWorkCenterId(...args); }
function getPlanningSupplyRows(...args) { return operationalRuntimeService.getPlanningSupplyRows(...args); }
function getWarehouseNomenclatureIdForSpecificationItem(...args) { return operationalRuntimeService.getWarehouseNomenclatureIdForSpecificationItem(...args); }
function getPlanningSupplySourceLabel(...args) { return operationalRuntimeService.getPlanningSupplySourceLabel(...args); }
function getPlanningSupplySummary(...args) { return operationalRuntimeService.getPlanningSupplySummary(...args); }
function getPlanningSupplyBlockingIssues(...args) { return operationalRuntimeService.getPlanningSupplyBlockingIssues(...args); }
function getProductionChainStepFlowLabel(...args) { return operationalRuntimeService.getProductionChainStepFlowLabel(...args); }
function getProductionChainOperationRows(...args) { return operationalRuntimeService.getProductionChainOperationRows(...args); }
function getProductionChainSourceInputLabel(...args) { return operationalRuntimeService.getProductionChainSourceInputLabel(...args); }
function getProductionChainSourceOutputLabel(...args) { return operationalRuntimeService.getProductionChainSourceOutputLabel(...args); }
function buildPlanningProductionChain(...args) { return operationalRuntimeService.buildPlanningProductionChain(...args); }
function renderPlanningProductionChainNode(...args) { return operationalRuntimeService.renderPlanningProductionChainNode(...args); }
function getPlanningFlowReadinessSummary(...args) { return operationalRuntimeService.getPlanningFlowReadinessSummary(...args); }
function renderPlanningWipBranchCards(...args) { return operationalRuntimeService.renderPlanningWipBranchCards(...args); }
function renderPlanningFlowRulePanel(...args) { return operationalRuntimeService.renderPlanningFlowRulePanel(...args); }
function getPlanningTaskOperationStats(...args) { return operationalRuntimeService.getPlanningTaskOperationStats(...args); }
function isWarehouseIssueRouteStep(...args) { return operationalRuntimeService.isWarehouseIssueRouteStep(...args); }
function getRouteStepFulfillmentProfile(...args) { return operationalRuntimeService.getRouteStepFulfillmentProfile(...args); }
function getPlanningTaskBomLabel(...args) { return operationalRuntimeService.getPlanningTaskBomLabel(...args); }
function getPlanningTaskReadiness(...args) { return operationalRuntimeService.getPlanningTaskReadiness(...args); }
function getPlanningStepTone(...args) { return operationalRuntimeService.getPlanningStepTone(...args); }
function getPlanningStepLineLabel(...args) { return operationalRuntimeService.getPlanningStepLineLabel(...args); }
function schedulePlanningRouteStructureSidebarSync(...args) { return operationalRuntimeService.schedulePlanningRouteStructureSidebarSync(...args); }
function syncPlanningRouteStructureSidebarHeight(...args) { return operationalRuntimeService.syncPlanningRouteStructureSidebarHeight(...args); }
function getAccessRoleForEmployee(...args) { return operationalRuntimeService.getAccessRoleForEmployee(...args); }
function updateAccessRoleProfile(...args) { return operationalRuntimeService.updateAccessRoleProfile(...args); }
function setAccessRoleProfileField(...args) { return operationalRuntimeService.setAccessRoleProfileField(...args); }
function setAccessRoleModulePermission(...args) { return operationalRuntimeService.setAccessRoleModulePermission(...args); }
function setAccessRoleAssignment(...args) { return operationalRuntimeService.setAccessRoleAssignment(...args); }
function resetAccessRoleConfiguration(...args) { return operationalRuntimeService.resetAccessRoleConfiguration(...args); }
function formatDateTimeShort(...args) { return operationalRuntimeService.formatDateTimeShort(...args); }
function createAccessPermissionRecord(...args) { return operationalRuntimeService.createAccessPermissionRecord(...args); }
function createAccessPermissionMap(...args) { return operationalRuntimeService.createAccessPermissionMap(...args); }
function getDefaultAccessRoleProfiles(...args) { return operationalRuntimeService.getDefaultAccessRoleProfiles(...args); }
function normalizeAccessPermissionRecord(...args) { return operationalRuntimeService.normalizeAccessPermissionRecord(...args); }
function normalizeAccessModulePermissions(...args) { return operationalRuntimeService.normalizeAccessModulePermissions(...args); }
function normalizeAccessRoleProfiles(value = []) {
  if (typeof operationalRuntimeService.normalizeAccessRoleProfiles === "function") {
    return operationalRuntimeService.normalizeAccessRoleProfiles(value);
  }
  return Array.isArray(value) ? value.filter((role) => role && ACCESS_ROLE_IDS.includes(String(role.id || ""))) : [];
}
function normalizeAccessRoleAssignments(value = {}) {
  if (typeof operationalRuntimeService.normalizeAccessRoleAssignments === "function") {
    return operationalRuntimeService.normalizeAccessRoleAssignments(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([employeeId, roleId]) => {
    const normalizedEmployeeId = String(employeeId || "").trim();
    const normalizedRoleId = String(roleId || "").trim();
    return normalizedEmployeeId && ACCESS_ROLE_IDS.includes(normalizedRoleId) ? [[normalizedEmployeeId, normalizedRoleId]] : [];
  }));
}
function getAccessRoleProfiles(...args) { return operationalRuntimeService.getAccessRoleProfiles(...args); }
function normalizeInterfaceRoleId(roleId = "", profiles = null) {
  if (typeof operationalRuntimeService.normalizeInterfaceRoleId === "function") {
    return operationalRuntimeService.normalizeInterfaceRoleId(roleId, profiles);
  }
  const candidate = String(roleId || "").trim();
  const roles = Array.isArray(profiles) && profiles.length
    ? profiles
    : Array.isArray(ui?.accessRoleProfiles) && ui.accessRoleProfiles.length
      ? ui.accessRoleProfiles
      : [];
  if (roles.some((role) => role?.id === candidate)) return candidate;
  return ACCESS_ROLE_IDS.includes(candidate) ? candidate : DEFAULT_INTERFACE_ROLE_ID;
}
function getAccessRoleById(...args) { return operationalRuntimeService.getAccessRoleById(...args); }
function getAuthenticatedAccessPerson(...args) { return operationalRuntimeService.getAuthenticatedAccessPerson(...args); }
function getAuthorizationBoundRoleId(...args) { return operationalRuntimeService.getAuthorizationBoundRoleId(...args); }
function getActiveInterfaceRole(...args) { return operationalRuntimeService.getActiveInterfaceRole(...args); }
function syncActiveRoleWithAuthorization(...args) { return operationalRuntimeService.syncActiveRoleWithAuthorization(...args); }
function getAccessRoleModulePermission(...args) { return operationalRuntimeService.getAccessRoleModulePermission(...args); }
function isModuleAllowedForRole(...args) { return operationalRuntimeService.isModuleAllowedForRole(...args); }
function getModuleDefinitions(...args) {
  if (typeof operationalRuntimeService.getModuleDefinitions === "function") {
    return operationalRuntimeService.getModuleDefinitions(...args);
  }
  const options = args[0] && typeof args[0] === "object" ? args[0] : {};
  const adminHost = typeof options.adminHost === "boolean"
    ? options.adminHost
    : typeof window !== "undefined" && MES_ADMIN_RUNTIME_HOSTS.has(String(window.location.hostname || "").trim().toLowerCase());
  return getMesModuleNavigationDefinitions({
    adminHost,
    includeStandalone: options.includeStandalone !== false,
  });
}
function getModuleAnnotation(...args) { return operationalRuntimeService.getModuleAnnotation(...args); }
function getModuleGroups(...args) { return operationalRuntimeService.getModuleGroups(...args); }
function getAvailableModules(...args) { return operationalRuntimeService.getAvailableModules(...args); }
function ensureAuthorizedModule(...args) { return operationalRuntimeService.ensureAuthorizedModule(...args); }
function getVisibleDirectorySections(...args) { return operationalRuntimeService.getVisibleDirectorySections(...args); }
function getVisibleDirectoryGroups(...args) { return operationalRuntimeService.getVisibleDirectoryGroups(...args); }
function getShiftMasterBoardUnassignedTaskCount(...args) { return operationalRuntimeService.getShiftMasterBoardUnassignedTaskCount(...args); }
function getModuleMenuBadges(...args) { return operationalRuntimeService.getModuleMenuBadges(...args); }
function renderModuleMenuBadge(...args) { return operationalRuntimeService.renderModuleMenuBadge(...args); }
function renderModuleMenu(...args) { return operationalRuntimeService.renderModuleMenu(...args); }
function renderTopbarAuthenticatedAccessCard(...args) { return operationalRuntimeService.renderTopbarAuthenticatedAccessCard(...args); }
function renderAppTopbar(...args) { return operationalRuntimeService.renderAppTopbar(...args); }
function refreshCurrentAppPage(...args) { return operationalRuntimeService.refreshCurrentAppPage(...args); }
operationalRuntimeService = createOperationalRuntimeServiceModule({
  ACCESS_ROLE_ACTIONS,
  ACCESS_ROLE_IDS,
  ACCESS_ROLE_SCOPES,
  APP_VERSION,
  BOARD_BOM_TERM,
  BOARD_SPEC_TERM,
  DEFAULT_INTERFACE_ROLE_ID,
  DISPATCH_FACT_STATUS_OPTIONS,
  GANTT_SLOT_STATUS_LABELS,
  GANTT_SLOT_STATUS_VALUES,
  MAIN_ROUTE_TASK_ID,
  MES_MODULE_BLUEPRINT_REGISTRY,
  MES_MODULE_NAVIGATION_GROUPS,
  MES_MODULE_NAVIGATION_REGISTRY,
  WORK_CENTER_OPERATIONS_SEEDED_STORAGE_KEY,
  WORK_ORDER_PLANNING_STATUS_VALUES,
  app,
  blockProtectedDestructiveAction,
  buildMesDocumentContract,
  buildMesFlowEvent,
  byId,
  defaultUiState,
  directorySectionGroups,
  directorySections,
  escapeAttribute,
  escapeHtml,
  findMesOperationReplacement,
  formatTimesheetHours: (...args) => typeof formatTimesheetHours === "function" ? formatTimesheetHours(...args) : String(Number(args[0] || 0)),
  fromDateInput,
  getAuthGateSession,
  getBomList: (...args) => typeof getBomList === "function" ? getBomList(...args) : null, getBomResultNomenclatureItem: (...args) => typeof getBomResultNomenclatureItem === "function" ? getBomResultNomenclatureItem(...args) : null,
  // Workshop must be renderable before the Gantt chunk is requested.  Do not
  // forward this through the lazy Gantt facade: it throws until `load()` has
  // completed.  The compact resolver above has the required calendar-id
  // semantics without importing the timeline implementation.
  getCalendarWorkCenterId: (workCenterId) => getPlanningCalendarWorkCenterId(workCenterId),
  getDefaultOperationCalculationType,
  getDefaultSecondsPerPanel,
  getFulfillmentLabel,
  getFulfillmentMeta,
  getFulfillmentTone,
  getMainRouteDependencyReadiness,
  getMesFlowTransitionView,
  getMesModuleFlowContract,
  getMesStatusView,
  getOperationRouteWorkCenterId,
  getPlanningCandidateWorkCenterIdsForRouteWorkCenter,
  getPlanningResourceForRouteStep,
  getPlanningRouteQuantity,
  getPlanningShiftSlotTimeLabel,
  getPlanningTasksForRoute,
  getProductionResource,
  getProductionResourceWorkCenterId,
  getProductionResourcesForWorkCenter,
  getProductionStructureEmployees,
  getProductionStructureExecutorRows,
  getProductionStructureMasterProfiles, getProductionStructureMatrixRuntimeOverrides: (...args) => typeof getProductionStructureMatrixRuntimeOverrides === "function" ? getProductionStructureMatrixRuntimeOverrides(...args) : {},
  getProductionStructureWorkCenters,
  getProjectDisplayName,
  getProjectDisplayOutput,
  getRouteConcreteTasksForPlanning,
  getRouteFlowLaunchSettings,
  getRouteInstructionWorkCenterId,
  getRouteInstructionWorkCenters,
  getRoutePlanningBatches,
  getRoutePlanningContext, getRouteSpecification,
  getRoutePlanningOrderAvailableKitCount,
  getRoutePlanningOrderWipBranchDetails, getRouteBomList: (...args) => typeof getRouteBomList === "function" ? getRouteBomList(...args) : null,
  getRouteStepFlowModel,
  getRouteStepPlanningTask,
  getRouteStepSelectedPlanningWorkCenterId,
  getRouteStepsForModule,
  getRouteStepsForPlanningTask,
  getRouteStepsForTask,
  getRouteTaskTypeLabel: (...args) => typeof getRouteTaskTypeLabel === "function" ? getRouteTaskTypeLabel(...args) : "объект",
  getRouteTaskInputObjectLabel,
  getRouteTaskProducedObjectLabel,
  getShiftMasterBoardModel: (...args) => typeof getShiftMasterBoardModel === "function" ? getShiftMasterBoardModel(...args) : ({ lanes: [] }),
  getSlotEffectiveOperationContext,
  getSlotGanttResourceId,
  getSlotGanttWorkCenterId,
  getSlotOperationFlow,
  getSlotPlanningOrderId,
  getSlotProducedQuantityAt,
  // The operational shell is rendered on every module route.  It must not
  // reach the lazy Gantt facade just to resolve a slot's route while the
  // Gantt chunk is still loading.
  getSlotRoute: (slot) => getPlanningSlotRoute(slot),
  getSlotRouteId,
  getTimesheetCell: (...args) => typeof getTimesheetCell === "function" ? getTimesheetCell(...args) : ({ value: "work", code: "work", hours: 8, overtime: 0 }),
  getTimesheetDayOption: (...args) => typeof getTimesheetDayOption === "function" ? getTimesheetDayOption(...args) : ({ value: args[0] || "work", label: args[0] || "work" }),
  getTimesheetEmployeeSchedule: (...args) => typeof getTimesheetEmployeeSchedule === "function" ? getTimesheetEmployeeSchedule(...args) : null,
  projectEmployeeAvailability,
  getSpecificationItemFulfillmentMode, getSpecificationItemBomId: (...args) => typeof getSpecificationItemBomId === "function" ? getSpecificationItemBomId(...args) : "",
  getSpecificationStructureItems, getSpekiStructureItemLabel: (...args) => typeof getSpekiStructureItemLabel === "function" ? getSpekiStructureItemLabel(...args) : "", getSpekiStructureTableRows: (...args) => typeof getSpekiStructureTableRows === "function" ? getSpekiStructureTableRows(...args) : [],
  getWorkCenter,
  getWorkCenterUnitsPerHour,
  icon,
  inferAccessRoleIdForPerson: (...args) => typeof inferAccessRoleIdForPerson === "function" ? inferAccessRoleIdForPerson(...args) : DEFAULT_INTERFACE_ROLE_ID,
  isAdminRuntimeHost,
  isAuthGateQaBypassEnabled,
  isManufacturingOutputReceiptRouteStep,
  isManufacturingOutputReceiptSlot,
  isSchedulableFulfillmentMode,
  isSmtOperationWorkCenter,
  isWarehouseWorkCenterId,
  joinRouteStepFlowLabels,
  makeFallbackProductionResource,
  mapLegacyWorkCenterId,
  mergeMesOperationMap,
  normalizeDeepLinkModuleId,
  normalizeDateInput,
  normalizeDirectoryRow,
  normalizeDirectoryState,
  normalizePlanningState,
  normalizeQuantity,
  normalizeRouteStepCalculationFields,
  normalizeShiftMasterAssignmentMatrix,
  normalizeShiftMasterFactQuantity,
  normalizeStructureFulfillmentMode,
  normalizeWarehouseQuantity,
  persistDirectoryState,
  persistState,
  recalculateSlotEndByQuantity,
  resolveWorkCenterIdFromName,
  routeStepRequiresManualPlanningLine,
  startOfDay,
  toDate,
  toDateInput,
  getUi: () => ui,
  setUi: (nextState) => { ui = nextState; },
  getPlanningState: () => planningState,
  setPlanningState: setPlanningStateAndInvalidate,
  getDirectoryState: () => directoryState,
  setDirectoryState: (nextState) => { directoryState = nextState; },
  getPlanningRouteStructureSidebarFrame: () => planningRouteStructureSidebarFrame,
  setPlanningRouteStructureSidebarFrame: (nextValue) => { planningRouteStructureSidebarFrame = nextValue; },
});
measureBootStep("initializeSystemDomainsState", () => reloadSystemDomainsState({
  source: "startup",
  // A cold browser must give the server-primary read model a chance before
  // importing the 1.5 MB legacy matrix.  If PostgreSQL is unavailable, the
  // asynchronous read below preserves the old migration as a safe fallback.
  migrateLegacy: false,
}));
// The initial shared-state metadata handshake now owns System Domains
// compatibility discovery. It calls handleSystemDomainsCompatibilityStatus()
// before version gating, avoiding a second cold request on PostgreSQL-primary
// or confirmed-absent contours.
if (startupDataMigrationRequired) {
  measureBootStep("migrateLegacyOperationsToDirectory", () => migrateLegacyOperationsToDirectory());
  measureBootStep("ensureWorkCenterOperations", () => ensureWorkCenterOperations());
  completeStartupDataMigrations();
}

function renderDenseInlineSelect(name, value, items, options = {}) {
  const selectedItem = items.find((item) => String(item.value) === String(value))
    || items[0]
    || { value: "", label: "Не выбрано", meta: "" };
  const summaryLabel = selectedItem.summaryLabel || selectedItem.label;
  const summaryMeta = Object.prototype.hasOwnProperty.call(selectedItem, "summaryMeta") ? selectedItem.summaryMeta : selectedItem.meta;
  const summaryIconName = selectedItem.summaryIconName || selectedItem.iconName || options.summaryIconName || "";
  const summaryTitle = selectedItem.summaryTitle || options.summaryTitle || (summaryIconName ? summaryLabel : "");
  const selectedTone = String(options.tone || selectedItem.tone || "").trim();
  const rootAttribute = options.type === "spekiStructureType"
      ? `data-dense-speki-structure-type="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureBom"
      ? `data-dense-speki-structure-bom="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureSpecification"
      ? `data-dense-speki-structure-specification="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureNomenclature"
      ? `data-dense-speki-structure-nomenclature="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureNomenclatureType"
      ? `data-dense-speki-structure-nomenclature-type="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureFulfillment"
      ? `data-dense-speki-structure-fulfillment="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureExecution"
      ? `data-dense-speki-structure-execution="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureOperation"
      ? `data-dense-speki-structure-operation="${escapeAttribute(options.itemId || "")}"`
    : options.type === "spekiStructureDepartment"
      ? `data-dense-speki-structure-department="${escapeAttribute(options.itemId || "")}"`
    : options.type === "routeStep"
    ? `data-dense-route-step-field="${escapeAttribute(name)}" data-route-step-id="${escapeAttribute(options.stepId || "")}"`
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
  const toneClass = selectedTone ? ` is-${escapeAttribute(selectedTone)}` : "";
  const actionClass = items.some((item) => item.action) ? " has-actions" : "";
  const disabledClass = options.disabled ? " is-disabled" : "";

  return `
    <details class="dense-inline-select${options.type ? ` dense-select-${escapeAttribute(options.type)}` : ""}${toneClass}${actionClass}${disabledClass}" data-ui-component="Dropdown" ${rootAttribute} ${options.disabled ? "aria-disabled=\"true\"" : ""}>
      <summary ${options.disabled ? "tabindex=\"-1\"" : ""}${summaryTitle ? ` title="${escapeAttribute(summaryTitle)}" aria-label="${escapeAttribute(summaryTitle)}"` : ""}>
        ${summaryIconName ? `<i class="dense-inline-summary-icon" aria-hidden="true">${icon(summaryIconName)}</i>` : ""}
        <span>
          <strong>${escapeHtml(summaryLabel)}</strong>
          ${summaryMeta ? `<small>${escapeHtml(summaryMeta)}</small>` : ""}
        </span>
        ${icon("chevronDown")}
      </summary>
      <div class="dense-inline-options">
        ${items.map((item) => {
          const itemToneClass = item.tone ? ` is-${escapeAttribute(item.tone)}` : "";
          return `
          <button class="${String(item.value) === String(value) ? "is-selected" : ""} ${item.action ? "is-command" : ""}${itemToneClass}" data-dense-value="${escapeAttribute(item.value)}" ${item.action ? `data-dense-action="${escapeAttribute(item.action)}"` : ""} type="button" ${options.disabled || item.disabled ? "disabled" : ""}>
            <strong>${escapeHtml(item.label)}</strong>
            ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
          </button>
        `;
        }).join("")}
      </div>
    </details>
  `;
}

let appEventsService = {};
function renderConfirmModal(...args) { return appEventsService.renderConfirmModal(...args); }
function getConfirmDialogConfig(...args) { return appEventsService.getConfirmDialogConfig(...args); }
function openConfirmDialog(...args) { return appEventsService.openConfirmDialog(...args); } function getDirectoryData(...args) { return appEventsService.getDirectoryData(...args); } function getDefaultOperationMapItemForRouteKind(...args) { return appEventsService.getDefaultOperationMapItemForRouteKind(...args); }
function buildWorkloadRows(...args) { return appEventsService.buildWorkloadRows(...args); }
function buildDeadlineRows(...args) { return appEventsService.buildDeadlineRows(...args); }
function buildSlotStatusItems(...args) { return appEventsService.buildSlotStatusItems(...args); }
function buildWarningTypeItems(...args) { return appEventsService.buildWarningTypeItems(...args); }
function buildWarningProjectItems(...args) { return appEventsService.buildWarningProjectItems(...args); }
function buildWarningRows(...args) { return appEventsService.buildWarningRows(...args); }
function buildWorkloadInsights(...args) { return appEventsService.buildWorkloadInsights(...args); }
function buildDeadlineInsights(...args) { return appEventsService.buildDeadlineInsights(...args); }
function buildWarningInsights(...args) { return appEventsService.buildWarningInsights(...args); }
function buildDonutGradient(...args) { return appEventsService.buildDonutGradient(...args); }
function getSlotDurationHours(...args) { return appEventsService.getSlotDurationHours(...args); }
function getSlotWorkingDurationMs(...args) { return appEventsService.getSlotWorkingDurationMs(...args); }
function getSlotCalendarDurationMs(...args) { return appEventsService.getSlotCalendarDurationMs(...args); }
function formatReportNumber(...args) { return appEventsService.formatReportNumber(...args); }
function renderDirectoryEditorModal(...args) { return appEventsService.renderDirectoryEditorModal(...args); }
function renderDirectoryReaderModal(...args) { return appEventsService.renderDirectoryReaderModal(...args); }
function getStatusUsedInText(...args) { return appEventsService.getStatusUsedInText(...args); }
function getStatusImpactView(...args) { return appEventsService.getStatusImpactView(...args); }
function getStatusImpactRoleDescription(...args) { return appEventsService.getStatusImpactRoleDescription(...args); }
function getStatusImpactParts(...args) { return appEventsService.getStatusImpactParts(...args); }
function getStatusContractKey(...args) { return appEventsService.getStatusContractKey(...args); }
function getStatusContractView(...args) { return appEventsService.getStatusContractView(...args); }
function getStatusFlowTransitions(...args) { return appEventsService.getStatusFlowTransitions(...args); }
function getStatusTransitionView(...args) { return appEventsService.getStatusTransitionView(...args); }
function getStatusNextDocumentView(...args) { return appEventsService.getStatusNextDocumentView(...args); }
function getStatusImpactMap(...args) { return appEventsService.getStatusImpactMap(...args); }
function getStatusAuditInfo(...args) { return appEventsService.getStatusAuditInfo(...args); }
function bindRouteStepDenseSelectEvents(...args) { return appEventsService.bindRouteStepDenseSelectEvents(...args); }
function bindGenericModalCloseEvents(...args) { return appEventsService.bindGenericModalCloseEvents(...args); }
function bindGlobalNavigation(...args) { return appEventsService.bindGlobalNavigation(...args); } function bindConfirmEvents(...args) { return appEventsService.bindConfirmEvents(...args); }
function navigateToModule(...args) { return appEventsService.navigateToModule(...args); }
function getModuleMenuButtonFromEventTarget(...args) { return appEventsService.getModuleMenuButtonFromEventTarget(...args); }
function openModuleFromMenuButton(...args) { return appEventsService.openModuleFromMenuButton(...args); }
function ensureRoutesEvents(...args) { return appEventsService.ensureRoutesEvents(...args); }
function bindRoutesEvents(...args) { return appEventsService.bindRoutesEvents(...args); } function bindNomenclatureEvents(...args) { return appEventsService.bindNomenclatureEvents(...args); } function saveNomenclatureCommand(...args) { return appEventsService.saveNomenclatureCommand(...args); } function deleteNomenclatureCommand(...args) { return appEventsService.deleteNomenclatureCommand(...args); } function bindBomListsEvents(...args) { return appEventsService.bindBomListsEvents(...args); } function saveBomCommand(...args) { return appEventsService.saveBomCommand(...args); } function deleteBomCommand(...args) { return appEventsService.deleteBomCommand(...args); }
function bindPlanningEvents(...args) { return appEventsService.bindPlanningEvents(...args); }
function bindShiftCalendarEvents(...args) { return appEventsService.bindShiftCalendarEvents(...args); }
function applyOperationMapChangesToRoutes(...args) { return appEventsService.applyOperationMapChangesToRoutes(...args); }
function getOperationDeleteUsage(...args) { return appEventsService.getOperationDeleteUsage(...args); }
function deleteOperationMapItem(...args) { return appEventsService.deleteOperationMapItem(...args); }
function deleteUserManagedDirectoryStatus(...args) { return appEventsService.deleteUserManagedDirectoryStatus(...args); }
function openProjectInPlanning(...args) { return appEventsService.openProjectInPlanning(...args); }
function bindDirectoryEvents(...args) { return appEventsService.bindDirectoryEvents(...args); }
function bindDirectoryForm(...args) { return appEventsService.bindDirectoryForm(...args); }
function saveDirectoryRow(...args) { return appEventsService.saveDirectoryRow(...args); }
function deleteDirectoryRow(...args) { return appEventsService.deleteDirectoryRow(...args); }
function deleteDirectoryStateRow(...args) { return appEventsService.deleteDirectoryStateRow(...args); }
// Rendering can run while an optional event service is still being assembled
// during startup.  Scroll preservation is an enhancement, not a prerequisite
// for drawing the first module, so keep that boundary deliberately no-op-safe.
function rememberScroll(...args) { return appEventsService?.rememberScroll?.(...args); }
function restoreScroll(...args) { return appEventsService?.restoreScroll?.(...args); }
function updateDependencyClip(...args) { return appEventsService.updateDependencyClip(...args); }

// Modal dismissal is used by every module, including lazy modules that open
// before the Gantt implementation has loaded.  Keep this small shared reset
// independent of the Gantt facade.  The Gantt runtime retains its own
// closeModals implementation for Gantt-local bindings after that chunk loads.
function closeAppModals() {
  ui.selectedSlotId = null;
  ui.editor = null;
  ui.splitSlotId = null;
  ui.ganttOptimizationDialog = null;
  ui.routePrintPreviewId = "";
  ui.workOrderPrintPreviewId = "";
  ui.shiftMasterBoardPrintPreviewId = "";
  ui.shiftWorkOrderPrintPreviewId = "";
  ui.shiftWorkOrderIssuePhotoViewer = null;
  ui.timesheetEditor = null;
  ui.directoryEditor = null;
  ui.authSessionModal = null;
  ui.confirmDialog = null;
  render();
}

appEventsService = createAppEventsServiceModule({
  AUTH_PIN_TEMPORARILY_DISABLED,
  BOARD_SPEC_TERM,
  BOM_COMPONENT_FIELDS,
  GANTT_SLOT_STATUS_LABELS,
  GANTT_SLOT_STATUS_VALUES,
  MES_STATUS_CONTRACT_KEYS,
  NOMENCLATURE_REA_COMPONENT_TYPE,
  PRODUCT_COMPOSITION_TERM,
  WORK_MODE_OPTIONS,
  addMs,
  app,
  audit: getStatusAuditInfo,
  applyOperationMapItemToRouteStep,
  applyPlanningOrderLaborToSlot,
  buildDefaultSpecificationStructureItems,
  calculateProjectProgress,
  cancelPlanningRoute,
  canEditCustomStatusDirectorySection,
  canEditDirectorySection,
  cascadeBatchFromSlot,
  changePlanningRouteQuantity,
  chartColors,
  createAppInteractionsModule,
  bindAuthPrototypeEvents: (...args) => bindAuthPrototypeEvents(...args),
  bindAuthSessionEvents: (...args) => bindAuthSessionEvents(...args),
  loadProductsEventsModule: () => import("./modules/products/events.js"),
  loadRoutesEventsModule: () => import("./modules/routes/events.js"),
  createSpekiSpecification,
  cancelAuthPrototypePinFeedback,
  completeAuthPrototypeLogin,
  deleteEmployeeSession: () => deleteEmployeeServerSession(),
  isLegacyDirectoryWriteBlocked,
  deleteRouteMapConfirmed,
  closeModals: () => closeAppModals(),
  doesAuthSessionFactNeedDeviationComment: (...args) => doesAuthSessionFactNeedDeviationComment(...args),
  directorySections,
  ensurePlanningRuntimeProjection: () => hydratePlanningRuntimeProjection(),
  ensurePlanningSystemDomains,
  ensureNomenclatureTypeExists: (...args) => ensureNomenclatureTypeExists(...args),
  ensureRouteTaskSeedSteps,
  escapeAttribute,
  escapeHtml,
  findOperationMapItemByNameAndWorkCenter,
  formatDate,
  formatShiftWorkOrderPersonName: (...args) => formatShiftWorkOrderPersonName(...args),
  fromDateInput,
  generateChildRouteCardsForActiveRoute,
  getActiveRouteForModule,
  getAuthPrototypeAttemptsLeft,
  getAuthPrototypePeople,
  getAuthPrototypePinPerson,
  getAuthSessionFactDeviationPercent: (...args) => getAuthSessionFactDeviationPercent(...args),
  getAuthSessionFactDraft: (...args) => getAuthSessionFactDraft(...args),
  getAuthSessionPrototypeModel: (...args) => getAuthSessionPrototypeModel(...args),
  getAuthSessionTaskGoodQuantity: (...args) => getAuthSessionTaskGoodQuantity(...args),
  getAvailableModules,
  getDefaultOperationCalculationType,
  getDefaultSecondsPerPanel,
  getDefaultStructureFulfillmentMode,
  getDefaultStructureNomenclatureType,
  getExecutionTypeForFulfillmentMode,
  getActiveSpecificationForModule,
  getBomImportRows: (...args) => typeof getBomImportRows === "function" ? getBomImportRows(...args) : [],
  getBomList: (...args) => typeof getBomList === "function" ? getBomList(...args) : null,
  getFallbackNomenclatureType: (...args) => typeof getFallbackNomenclatureType === "function" ? getFallbackNomenclatureType(...args) : "",
  getNomenclatureDeleteUsage: (...args) => typeof getNomenclatureDeleteUsage === "function" ? getNomenclatureDeleteUsage(...args) : { specificationsCount: 0, bomRowsCount: 0 },
  getNomenclatureItem: (...args) => typeof getNomenclatureItem === "function" ? getNomenclatureItem(...args) : null,
  getGanttSlotStatusView,
  getManualPlanningAssignmentForRouteStep,
  getMesDocumentKind,
  getMesFlowTransitionsForStatus,
  getMesStatusView,
  getModuleDefinitions,
  getOperationMapItem,
  getOperationMapRows,
  getOperationRouteWorkCenterId,
  getPlanningCandidateWorkCenterIdsForRouteWorkCenter,
  getPlanningResourceForRouteStep,
  getPlanningRouteQuantity,
  getPlanningRouteSlots,
  getPlanningWorkCenters,
  getProductionContexts,
  getProductionResource,
  getProject,
  getProjectDisplayName,
  getProjectRouteForModule,
  getRouteBindingContext,
  getRouteBindingModeForSelection,
  getRouteDeleteUsage,
  getRouteDocumentKind,
  getRouteForStep,
  getRouteInstructionWorkCenterId,
  getRouteInstructionWorkCenters,
  getRouteModuleSelectionValue,
  getRoutePlanningContext,
  getRouteProductionContext,
  getRouteProductionId,
  getRouteStepFlowModel,
  getRouteStepPlanningCandidateWorkCenterIds,
  getRouteStepSelectedPlanningWorkCenterId,
  getRouteStepTaskId,
  getRouteStepsForModule,
  getRouteStepsForTask,
  getRouteTasksForModule,
  getShiftMasterBoardModel: (...args) => typeof getShiftMasterBoardModel === "function" ? getShiftMasterBoardModel(...args) : ({ rows: [], allRows: [] }),
  getSlotPlanningOrderId,
  getSlotRouteId,
  getSlotWarnings,
  getWarningProductionId,
  getSpecificationByProjectId,
  getSpecificationDeleteUsage,
  getSpecificationItemFulfillmentMode,
  getSpecificationRouteForModule,
  getSpecificationStructureItems,
  getStatusLifecycleModules,
  getStatusRegistryKindLabel,
  getWorkCenter,
  getWorkCenterUnitsPerHour,
  icon,
  importBomFromXlsxFile,
  isGanttSlotCompleted,
  isUserManagedDirectoryStatus,
  isAuthPrototypePinFeedbackLocked,
  isManufacturingOutputReceiptOperation,
  isManufacturingOutputReceiptRouteStep,
  isPlanningWorkCenterCompatibleWithRouteStep,
  isSchedulableFulfillmentMode,
  isWarehouseWorkCenterId,
  joinUiClasses,
  lockAuthGate,
  makeId,
  makeManualRouteStepFlowItems,
  mapLegacyWorkCenterId,
  mountGlobalVisualSystem,
  normalizeBoardsPerPanel,
  normalizeDirectoryRow,
  normalizeDirectorySectionId,
  normalizeDirectoryState,
  normalizeLookupText,
  normalizeAuthSessionFactField: (...args) => normalizeAuthSessionFactField(...args),
  normalizeOptionalPositiveInteger,
  normalizePlainRecord,
  normalizePlanningLaborNoteByRow,
  normalizePlanningLaborPositiveNumber,
  normalizeShiftMasterBoardQuantity,
  normalizeShiftWorkOrderIssueReports: (...args) => typeof normalizeShiftWorkOrderIssueReports === "function" ? normalizeShiftWorkOrderIssueReports(...args) : normalizePlainRecord(args[0]),
  normalizePlanningState,
  normalizeNomenclatureType,
  normalizeRouteBindingValue,
  normalizeRouteStepCalculationFields,
  normalizeSpecificationStructureItem,
  normalizeStructureFulfillmentMode,
  notifySaveSuccess,
  parsePlanningOrderLaborKey,
  persistDirectoryState,
  persistDirectoryStateDurably,
  persistDirectoryStateWithRemoval,
  persistNomenclatureDirectoryMutationDurably,
  persistState,
  persistUiState,
  pickDefaultBomForSpecificationItem,
  recalculateSlotEndByQuantity,
  recordDirectoryEntityDeletion,
  render,
  renderUiFormActions,
  renderUiFormField,
  renderUiFormGrid,
  renderUiModalFrame,
  renderPreservingModuleScroll,
  refreshPlanningWorkbench,
  resolveRouteModuleProjectId,
  resolveWorkCenterIdFromName,
  resetAuthPrototypeAttempts,
  resetAuthPrototypePinEntry: () => {
    authPrototypePinDraft = "";
    authPrototypeKeypadDigits = [];
  },
  saveAuthSessionTaskReport: (...args) => saveAuthSessionTaskReport(...args),
  saveShiftMasterBoardAssignment: (...args) => typeof saveShiftMasterBoardAssignment === "function" ? saveShiftMasterBoardAssignment(...args) : false,
  saveShiftMasterBoardFact: (...args) => typeof saveShiftMasterBoardFact === "function" ? saveShiftMasterBoardFact(...args) : false,
  scheduleAuthPrototypePinValidation,
  schedulePlanningRouteToGantt,
  runLongTask,
  selected,
  setAuthSessionFactDraft: (...args) => setAuthSessionFactDraft(...args),
  setAuthSessionReportDraft: (...args) => setAuthSessionReportDraft(...args),
  setShiftWorkbenchDate: (...args) => typeof setShiftWorkbenchDate === "function" ? setShiftWorkbenchDate(...args) : false,
  moveShiftWorkbenchDate: (...args) => typeof moveShiftWorkbenchDate === "function" ? moveShiftWorkbenchDate(...args) : false,
  setShiftWorkbenchToday: (...args) => typeof setShiftWorkbenchToday === "function" ? setShiftWorkbenchToday(...args) : false,
  setPlanningOrderLaborSetting,
  slotMatchesProductionContext,
  statusReportColors,
  syncPlanningManualLaborToStepSlots,
  syncPlanningBoardsPerPanel,
  syncPlanningRouteQuantity,
  syncPlanningRouteStartDate,
  syncSpecificationDerivedFields,
  upsertBomResultToNomenclature: (...args) => typeof upsertBomResultToNomenclature === "function" ? upsertBomResultToNomenclature(...args) : null,
  toDate,
  toDateInput,
  updateModuleUrlParam,
  updatePlanningSupplyFulfillment,
  withDirectoryEntityRemovalAllowed,
  withPlanningEntityRemovalAllowed,
  getUi: () => ui,
  setUi: (nextState) => { ui = nextState; },
  getPlanningState: () => planningState,
  setPlanningState: setPlanningStateAndInvalidate,
  getDirectoryState: () => directoryState,
  setDirectoryState: (nextState) => { directoryState = nextState; },
  getDenseInlineViewportListenersBound: () => denseInlineViewportListenersBound,
  setDenseInlineViewportListenersBound: (nextValue) => { denseInlineViewportListenersBound = nextValue; },
  getMobileModuleSwitcherBehaviorBound: () => mobileModuleSwitcherBehaviorBound,
  setMobileModuleSwitcherBehaviorBound: (nextValue) => { mobileModuleSwitcherBehaviorBound = nextValue; },
  getGanttScrollRestoreInProgress: () => ganttScrollRestoreInProgress,
  setGanttScrollRestoreInProgress: (nextValue) => { ganttScrollRestoreInProgress = nextValue; },
  getAuthPrototypePinDraft: () => authPrototypePinDraft,
  setAuthPrototypePinDraft: (nextValue) => { authPrototypePinDraft = nextValue; },
  getAuthPrototypePinFeedbackTimer: () => authPrototypePinFeedbackTimer,
  setAuthPrototypePinFeedbackTimer: (nextValue) => { authPrototypePinFeedbackTimer = nextValue; },
  getAuthPrototypePinFeedbackSequence: () => authPrototypePinFeedbackSequence,
  setAuthPrototypePinFeedbackSequence: (nextValue) => { authPrototypePinFeedbackSequence = nextValue; },
  getAuthPrototypeKeypadDigits: () => authPrototypeKeypadDigits,
  setAuthPrototypeKeypadDigits: (nextValue) => { authPrototypeKeypadDigits = nextValue; },
  getFocusFullscreenRestoreAttempted: () => focusFullscreenRestoreAttempted,
  setFocusFullscreenRestoreAttempted: (nextValue) => { focusFullscreenRestoreAttempted = nextValue; },
});

function updateClockOnly() {
  const clock = app.querySelector("[data-clock]");
  if (clock) clock.textContent = formatDateTime(ui.now);
}

let ganttRuntime;
const {
  renderToolbar,
  renderGanttOptimizationModal,
  renderPlanningDirectorCommand,
  renderDirectorFlowStep,
  renderTimeline,
  renderGanttTimelineWeekGroup,
  renderGanttTimelineDayCell,
  getGanttWeekBoundaries,
  renderGanttWeekBoundaryLayer,
  renderRow,
  parseShiftMinutes,
  getWorkCenterCalendar,
  isScheduleWorkDay,
  getCalendarWorkCenterId,
  getCalendarWorkCenter,
  getGanttRowCalendar,
  getGanttRowCalendarWorkCenterId,
  getWorkingIntervalsForCalendar,
  getWorkingIntervalsForDay,
  getWorkingIntervalsBetween,
  snapToWorkingTime,
  addWorkingDuration,
  getWorkingDurationBetween,
  minuteToDate,
  addCalendarDays,
  addNonWorkingSegment,
  buildVisibleSharedNonWorkingIntervals,
  removeSharedNonWorkingIntervals,
  buildNonWorkingSegments,
  renderNonWorkingLayer,
  renderRowLabel,
  getGanttLinkedRecordEntries,
  getGanttFactRecordEntries,
  isGanttFactRecordReported,
  sumGanttFactRecords,
  getGanttSlotFactQuantity,
  getShiftMasterAssignmentQuantity,
  getShiftMasterAssignmentsForGanttSlot,
  getShiftMasterBoardAssignmentEntriesForGanttSlot,
  getShiftMasterBoardFactEntriesForGanttSlot,
  getAuthSessionFactEntriesForGanttSlot,
  getGanttSlotOperationalState,
  getGanttSlotOperationalSegmentState,
  formatGanttRowMetricQuantity,
  getGanttRowMetrics,
  renderGanttRowMetricCells,
  renderRouteTaskMini,
  renderProjectRouteMini,
  renderTodayMarker,
  getSlotTransferBatchVisual,
  renderSlotTransferBatchVisual,
  normalizeGanttOperationalQuantity,
  formatGanttOperationalQuantity,
  toGanttOperationalPercent,
  makeGanttOperationalSegment,
  getGanttAssignmentSegments,
  getGanttCompositeOperationalSegments,
  formatGanttOperationalDelta,
  formatGanttOperationalSignedDelta,
  getGanttSlotHoverSummaryText,
  getGanttOperationalMetaText,
  renderGanttOperationalSegments,
  renderGanttSlotOperationalLayer,
  getGanttSlotGeometryRadius,
  getSlotSegmentEdgeClass,
  renderSlot,
  renderGanttSlotLine,
  getGanttQuantityLabelMode,
  getSlotRouteMeta,
  getSlotVisualRect,
  distributeQuantityAcrossWorkingSegments,
  getSlotWorkingVisualSegments,
  getSlotNonWorkingVisualSegments,
  isTransferBatchDependencyPair,
  renderTransferGateMarkers,
  renderDependencies,
  getGanttDependencyRouteKey,
  getActiveGanttDependencyRouteStore,
  applyGanttDependencyRouteOffsets,
  renderGanttDependencyEditControls,
  buildDependencySlotMaskRects,
  renderGanttSnapOverlay,
  getDependencyConnectionRect,
  clipDependencyRectToTimeline,
  getDependencyTimelineAnchorRect,
  shouldRenderDependencyBetweenTimelineAnchors,
  buildDependencyPathAroundSlots,
  buildGanttFinishStartDependencyPoints,
  compactDependencyPointObjects,
  dependencyRouteBacktracksOverStart,
  getDependencyStartDetourPoint,
  getDependencyObstacleRects,
  routeDependencyPointsAroundSlots,
  buildDependencyOuterCorridorCandidates,
  getDependencyObstacleExtents,
  getDependencyPathObstacleRects,
  getShortestDependencyPath,
  getBestConstrainedDependencyPath,
  compareDependencyPathScore,
  compareDependencyPathLength,
  getDependencyPathLength,
  getDependencyPathBendCount,
  dependencyPathBacktracksOverStart,
  findDependencyPathObstacle,
  dependencyPathIntersectsObstacles,
  countDependencyPathObstacleHits,
  findDependencySegmentObstacle,
  dependencySegmentIntersectsRect,
  compactDependencyPoints,
  getDependencyPathPointsBeforeArrow,
  buildDependencyOrthogonalPath,
  buildDependencyPathWithLineJumps,
  getDependencyRoundedCornerData,
  groupDependencyJumpsBySegment,
  appendDependencySegmentWithLineJumps,
  getRenderableDependencyJumps,
  getDependencyJumpPoint,
  toDependencyPoint,
  getDependencyPointDistance,
  getDependencyCrossingJumpsByRoute,
  getDependencyRenderRoutesWithSeparatedHorizontals,
  dependencyHorizontalSegmentsOverlap,
  getDependencyHorizontalTrackY,
  applyDependencyHorizontalTrackDetours,
  getDependencyRouteCrossings,
  getDependencyCrossingJumpTarget,
  getDependencyCrossingGapRadius,
  getDependencyRouteSegments,
  getDependencySegmentCrossing,
  getDependencyOrthogonalSegmentCrossing,
  buildDependencyPath,
  roundedOrthogonalPath,
  normalize,
  distance,
  isSameDirection,
  round,
  renderIssueDock,
  renderPlanningAssistantDock,
  formatWarningType,
  renderSlotDrawer,
  renderDrawerRouteSequence,
  renderEditorModal,
  renderSplitModal,
  bindEvents,
  bindSlotForm,
  bindSplitForm,
  toggleGanttDependencyEditMode,
  beginGanttDependencyRouteDrag,
  updateGanttDependencyRouteDraft,
  setGanttDependencyDraftOffset,
  beginDrag,
  suppressNextGanttSlotClick,
  shouldSuppressGanttSlotClick,
  rowFromPointer,
  placeSlotInNearestWindow,
  moveSlotToNearestWindow,
  toggleSlotLock,
  autoFixAllWarnings,
  applyWarningFixInPlace,
  autoFixWarning,
  savePlanSnapshot,
  updateSlotQuantity,
  cycleSlotStatus,
  deleteSlotConfirmed,
  focusSlot,
  focusRoute,
  focusProject,
  closeModals,
  buildRows,
  getRouteGanttResourceRows,
  buildRowLayout,
  buildSlotPlacementMap,
  getGanttReactModel,
  getScaledRowHeight,
  calculateSlotPlacements,
  getWeekSlotHeight,
  getSlotTop,
  getSlotHeight,
  getProjectCenters,
  getRouteCenters,
  getSlotsForProjectCenter,
  getRouteStepIds,
  getSlotRoute,
  getRouteSlots,
  slotMatchesRouteWorkCenterId,
  getSlotsForRouteCenter,
  getSlotsForRouteStep,
  getSlotsForRouteResource,
  getGanttCenterRouteWorkCenterId,
  ganttCenterMatchesFilter,
  ganttRouteStepMatchesFilter,
  ganttSlotMatchesFilter,
  getProjectSummarySlots,
  getRouteSummarySlots,
  projectMatchesFilters,
  routeMatchesGanttFilters,
  getRowSlots,
  getVisibleSlotRowId,
} = (ganttRuntime = createLazyGanttRuntimeModule({
  active: false,
  addMs,
  AGGREGATE_SLOT_HEIGHT,
  AGGREGATE_SLOT_TOP,
  app,
  applyRecalculatedSlotTiming,
  applyGanttRowToSlot,
  areAllVisibleProjectsExpanded,
  attributes: {},
  best: null,
  bomListId: "",
  buildBacklogItems,
  buildWorkloadRows,
  button: null,
  byId,
  calculatePlannedEndByQuantity,
  calculateProjectProgress,
  calculateQuantityByDuration,
  changePlanningSlotSchedule,
  calculationType: "",
  candidate: null,
  capacity: 0,
  cascadeIfEnabled,
  cleanDateTime,
  cleanOptionalDateTime,
  cloneGanttDependencyRouteStore,
  code: "",
  compactVisibleGanttChains,
  currentWorkCenterId: "",
  dateToX,
  DAY_MS,
  days: [],
  DEPENDENCY_CROSSING_GAP_RADIUS,
  DEPENDENCY_HORIZONTAL_TRACK_GAP,
  deviationComment: "",
  deviationNotes: [],
  draft: null,
  escapeHtml,
  extendTimelineIfNeeded,
  field: "",
  findFreeWindow,
  focus,
  formatDate,
  formatDateTime,
  formatDuration,
  formatShortDate,
  formatWorkShift,
  fulfillmentMode: "",
  GANTT_DEPENDENCY_ARROW_BASE_REF_X,
  GANTT_DEPENDENCY_ARROW_HEAD_ADVANCE,
  GANTT_DEPENDENCY_ROUTE_VERSION,
  GANTT_SLOT_STATUS_LABELS,
  GANTT_SLOT_STATUS_VALUES,
  ganttScrollRestoreInProgress,
  getAuthSessionTaskRowId: (...args) => typeof getAuthSessionTaskRowId === "function" ? getAuthSessionTaskRowId(...args) : String(args[0] || ""),
  getBatch,
  getBomList: (...args) => typeof getBomList === "function" ? getBomList(...args) : null,
  getDefaultOperationCalculationType,
  getDefaultWorkMode,
  getDependencyPairs,
  getEarliestRouteStart,
  getGanttDependencyArrowLength,
  getGanttDependencyEntryWidth,
  getGanttOptimizationWorkOrders,
  getGanttResourceForSlot,
  getGanttSlotStatusClass,
  getGanttSlotStatusView,
  getGanttSnapMs,
  getGanttSnapWidth,
  getGanttZoomPercent,
  getWeekNumber,
  getMainRouteDependencyReadiness,
  getOperationMapItem,
  getPlanningResourceForRouteStep,
  getPlanningRouteOrderState,
  getPlanningWorkCenters,
  getProductionContexts,
  getProject,
  getProjectDeadlineState,
  getProjectDisplayName,
  getProjectRouteForModule,
  getProjectRouteSteps,
  getPlanningRouteQuantity,
  getRouteBomList,
  getRouteBufferMs,
  getRouteFlowLaunchSettings,
  getRouteForStep,
  getRouteInstructionWorkCenterId,
  getRouteNeighbor,
  getRoutePlanningBatches,
  getRoutePlanningContext,
  getRoutePlanningOrderWipBranchDetails,
  getRouteProductionId,
  getRouteSpecification,
  getRouteStepFlowModel,
  getRouteStepPlanningAssignmentForSlot,
  getRouteStepSelectedPlanningWorkCenterId,
  getRouteStepsForModule,
  getRouteStepTaskId,
  getRuntimePlanningState,
  getResourceRowId,
  getSlotCalendarDurationMs,
  getSlotDurationHours,
  getSlotEffectiveOperationContext,
  getSlotOperationFlow,
  getSlotPlanningOrderId,
  getSlotProductionContextId,
  getSlotRequiredDurationMs,
  getSlotRouteId,
  getSlotRouteTaskId,
  getSlotWarnings,
  getSlotWorkingDurationMs,
  getSpecificationByProjectId,
  getVisibleGanttRoutes,
  getWorkCalendarLabel,
  getWorkCenter,
  getSmtLineIdFromWorkCenterId,
  group: null,
  groups: [],
  icon,
  input: null,
  isGanttRouteExpanded,
  isGanttSlotActive,
  isGanttSlotCompleted,
  isManufacturingOutputReceiptRouteStep,
  isManufacturingOutputReceiptSlot,
  isoLocal,
  isPlanningUnit: (center) => center?.isPlanningUnit !== false,
  isPlanningWorkCenter,
  isSmtLineWorkCenterId,
  isWarehouseWorkCenterId,
  isWorkOrderPlanningCanceled,
  item: null,
  laborMinutes: 0,
  LEFT_WIDTH,
  MAIN_ROUTE_TASK_ID,
  makeId,
  mapLegacyWorkCenterId,
  MES_SMT_WORK_CENTER_IDS,
  name: "",
  normalizeBoardsPerPanel,
  normalizeDispatchExecutorCount,
  normalizeDispatchLaborMinutes,
  normalizeGanttDependencyRouteStore,
  normalizeGanttSlotContent,
  normalizeGanttZoom,
  normalizePlainRecord,
  normalizePlanningLaborPositiveNumber,
  normalizeQuantity,
  normalizeShiftMasterAssignment,
  normalizeShiftMasterBoardQuantity,
  normalizeShiftMasterExecutorQuantity,
  normalizeShiftMasterFactQuantity,
  normalizeWorkMode,
  normalizeWorkSchedule,
  notifySaveSuccess,
  offsets: {},
  openConfirmDialog,
  openPlanningForProject,
  order: 0,
  overrides: {},
  persistState,
  persistUiState,
  prependTimelineIfNeeded,
  PRODUCT_COMPOSITION_TERM,
  PROJECT_ROW_HEIGHT,
  readonly: false,
  readyAt: null,
  record: null,
  render,
  renderOperationFlowMap,
  renderUiDrawerShell,
  renderUiModalShell,
  required: false,
  rescheduleAllGanttSlotsByCurrentCalendars,
  resourceParticipatesInCalculation,
  resourceParticipatesInPlanning,
  routeIndex: 0,
  routeStepIds: [],
  routeStepRequiresManualPlanningLine,
  routeWorkCenterId: "",
  rowLayout: null,
  scaleConfig,
  scaleInfo: null,
  scrollTop: 0,
  secondsPerPanel: 0,
  selected,
  setGanttZoom,
  setupMin: 0,
  sharedNonWorkingIntervals: [],
  slotEnd: null,
  slotMatchesPlanningOrder,
  slotMatchesProductionContext,
  slotPlacementMap: null,
  slotStart: null,
  snapDate,
  source: null,
  specificationId: "",
  specifications: [],
  STANDARD_SLOT_HEIGHT,
  STANDARD_SLOT_TOP,
  startOfDay,
  startOfWeek,
  stats: null,
  stepId: "",
  style: "",
  suffix: "",
  suppressedGanttSlotClick,
  taskId: "",
  text: "",
  TIMELINE_HEIGHT,
  toDate,
  toDateInput,
  toSlotDateTime,
  total: 0,
  type: "",
  updateDependencyClip,
  value: "",
  version: "",
  warningsContext: null,
  WEEK_SLOT_GAP,
  WEEK_SLOT_HEIGHT,
  WEEK_SLOT_TOP,
  WORK_ROW_HEIGHT,
  workMode: "",
  workSchedule: null,
  getUi: () => ui,
  getPlanningState: () => planningState,
  getDirectoryState: () => directoryState,
}));

({ getPlanningWorkItemId, parsePlanningWorkItemId, getPlanningWorkItemSet, getDefaultPlanningWorkItem, getPlanningActiveWorkItem } = createPlanningWorkItemHelpers({
  getUi: () => ui,
  getPlanningState: () => planningState,
  routeStepRequiresManualPlanningLine,
  isSmtOperationWorkCenter,
  getRouteStepSelectedPlanningWorkCenterId,
}));
initializeModuleRuntime();
rememberSharedUiSignature();
startRuntimeApplication();
if (isEmployeeServerAuthAvailable()) void reconcileEmployeeServerSession();

function getProject(id) {
  // Production context facade. The name stays for compatibility with the older
  // Gantt code, but it resolves a specification-centered production context.
  const legacyProject = (planningState.projects || []).find((project) => project.id === id);
  if (legacyProject) return legacyProject;
  const specification = getSpecificationByProjectId(id) || getSpecificationById(id);
  return getProductionContextForSpecification(specification);
}

function getProductionContexts() {
  return getDirectoryRows("specifications")
    .map((specification) => getProductionContextForSpecification(specification))
    .filter(Boolean);
}

function getSpecificationByProjectId(productionId) {
  if (!productionId) return null;
  return getDirectoryRows("specifications").find((specification) => (
    specification.id === productionId
    || specification.projectId === productionId
  )) || null;
}

function getProductionContextForSpecification(specification) {
  if (!specification) return null;
  return {
    id: specification.id,
    name: specification.outputItem || specification.name || PRODUCT_COMPOSITION_TERM,
    orderNumber: specification.orderNumber || "",
    customer: specification.customer || "",
    totalQuantity: normalizeOptionalPositiveInteger(specification.productionQuantity) || 1,
    dueDate: specification.dueDate || toDateInput(addMs(new Date(), 21 * 24 * 60 * 60 * 1000)),
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
  const route = (planningState.routes || []).find((item) => item.id === id)
    || (planningState.routes || []).find((item) => (planningState.slots || []).some((slot) => (
      slotMatchesPlanningOrder(slot, id)
      && getSlotRouteId(slot, planningState) === item.id
    )));
  return route ? getRoutePlanningOrder(route) : null;
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

function renderMesIconSvg(svg, name, sourceKind) {
  const safeName = escapeAttribute(name || "info");
  const safeSource = escapeAttribute(sourceKind || "unknown");
  return String(svg || "").replace(/^<svg\b([^>]*)>/, (match, rawAttributes = "") => {
    const attributes = rawAttributes
      .replace(/\sclass="[^"]*"/g, "")
      .replace(/\sdata-icon="[^"]*"/g, "")
      .replace(/\sdata-icon-source="[^"]*"/g, "")
      .replace(/\saria-hidden="[^"]*"/g, "")
      .replace(/\sfocusable="[^"]*"/g, "")
      .trim();
    const normalizedAttributes = attributes ? " " + attributes : "";
    return `<svg${normalizedAttributes} class="mes-icon mes-icon-${safeName} mes-icon-source-${safeSource}" data-icon="${safeName}" data-icon-source="${safeSource}" aria-hidden="true" focusable="false">`;
  });
}

function icon(name) {
  const iconName = getMesCustomIconName(name) || getMesCustomIconName("info");
  const svg = getMesCustomIconSvg(iconName);
  const entry = getMesCustomIconEntryBySemanticSlug(iconName);
  if (!svg && entry?.source === "custom-svg" && !mesCustomIconLoadScheduled) {
    mesCustomIconLoadScheduled = true;
    void loadMesCustomIconSvgs()
      .then(() => {
        if (appBootstrapped) render({ skipRememberScroll: true });
      })
      .catch(() => {
        // The regular interface icon remains available if an optional custom SVG cannot load.
      });
  }
  const fallbackSvg = getMesCustomIconSvg("info");
  if (!svg && !fallbackSvg) return "";
  return renderMesIconSvg(svg || fallbackSvg, iconName || "info", entry?.source || "registry");
}

function getMesFullscreenElement() {
  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement
    || null;
}

function requestMesBrowserFullscreen() {
  const root = document.documentElement;
  const request = root.requestFullscreen
    || root.webkitRequestFullscreen
    || root.mozRequestFullScreen
    || root.msRequestFullscreen;
  if (!request) return Promise.resolve(false);
  return Promise.resolve(request.call(root, { navigationUI: "hide" })).then(() => true);
}

function exitMesBrowserFullscreen() {
  const exit = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.mozCancelFullScreen
    || document.msExitFullscreen;
  if (!exit || !getMesFullscreenElement()) return Promise.resolve(false);
  return Promise.resolve(exit.call(document)).then(() => true);
}

async function syncMesBrowserFullscreenForFocus(nextFocusMode) {
  try {
    if (nextFocusMode) {
      if (getMesFullscreenElement()) return true;
      return await requestMesBrowserFullscreen();
    }
    if (!getMesFullscreenElement()) return false;
    await exitMesBrowserFullscreen();
    return true;
  } catch (error) {
    console.warn("[MES focus] Browser fullscreen request was rejected", error);
    return false;
  }
}

async function setMesFocusMode(nextFocusMode, options = {}) {
  const enabled = Boolean(nextFocusMode);
  const shouldSyncFullscreen = Boolean(options.syncFullscreen);
  const fullscreenApplied = shouldSyncFullscreen
    ? await syncMesBrowserFullscreenForFocus(enabled)
    : false;
  ui.focusMode = enabled;
  persistUiState();
  if (!enabled || fullscreenApplied) focusFullscreenRestoreAttempted = false;
  const fullscreenNote = shouldSyncFullscreen && enabled && !fullscreenApplied
    ? " · полноэкранный режим недоступен"
    : "";
  notifySaveSuccess(`${enabled ? "Режим фокуса включен" : "Режим фокуса выключен"}${fullscreenNote}`);
  render();
  return enabled;
}

async function toggleMesFocusMode(options = {}) {
  // An explicit click or keyboard shortcut is always a real toggle.  The old
  // restore-first branch treated the first click on an active button as a
  // fullscreen retry, which made focus mode look stuck when the browser
  // rejected fullscreen permissions (the normal case in the in-app browser).
  return setMesFocusMode(!ui.focusMode, options);
}

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    void toggleMesFocusMode({ syncFullscreen: true });
    return;
  }

  if (event.key === "Escape") {
    closeAppModals();
  }
});

window.addEventListener("click", (event) => {
  const moduleButton = getModuleMenuButtonFromEventTarget(event.target);
  if (!moduleButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openModuleFromMenuButton(moduleButton);
}, true);

window.addEventListener("click", (event) => {
  const focusModeButton = event.target.closest?.("[data-toggle-focus-mode]");
  if (focusModeButton && (app.contains(focusModeButton) || focusModeButton.closest(".mes-visual-mode-tray"))) {
    event.preventDefault();
    void toggleMesFocusMode({ syncFullscreen: true });
    return;
  }

  const refreshAppButton = event.target.closest?.("[data-refresh-app]");
  if (refreshAppButton && app.contains(refreshAppButton)) {
    event.preventDefault();
    refreshCurrentAppPage();
    return;
  }

  const moduleButton = event.target.closest?.("[data-module]");
  if (!moduleButton || !app.contains(moduleButton)) return;
  navigateToModule(moduleButton.dataset.module);
});

window.addEventListener("resize", () => {
  if (ui.activeModule === "planning") schedulePlanningRouteStructureSidebarSync();
}, { passive: true });

window.addEventListener("beforeunload", () => {
  rememberScroll();
  persistUiState();
  persistAuthState();
});
