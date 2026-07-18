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
import { createRoutesEventsModule } from "./modules/routes/events.js";
import { createProductsRenderModule } from "./modules/products/render.js";
import { createProductsEventsModule } from "./modules/products/events.js";
import { createLazyGanttRuntimeModule } from "./modules/gantt_runtime/lazy_facade.js";
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
import { SPECIFICATIONS2_STORAGE_KEY, SYSTEM_DOMAINS_STORAGE_KEY } from "./app_constants.js";
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

const APP_VERSION_FALLBACK = "v.1.499.33";
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
  lastSharedUiSignature: "",
};

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
  focusRoute: (...args) => typeof focusRoute === "function" ? focusRoute(...args) : undefined,
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
  getWarningProductionId: (...args) => typeof getWarningProductionId === "function"
    ? getWarningProductionId(...args)
    : (args[0]?.productionId || args[0]?.projectId || ""),
  getSpecificationItemBoardsPerPanel, getSpecificationBomEntries: (...args) => typeof getSpecificationBomEntries === "function" ? getSpecificationBomEntries(...args) : [], getSpecificationById: (...args) => typeof getSpecificationById === "function" ? getSpecificationById(...args) : null, getSpecificationItemBomId: (...args) => typeof getSpecificationItemBomId === "function" ? getSpecificationItemBomId(...args) : "", getSpekiStructureItemDisplayName: (...args) => typeof getSpekiStructureItemDisplayName === "function" ? getSpekiStructureItemDisplayName(...args) : "", getSpekiStructureItemLabel: (...args) => typeof getSpekiStructureItemLabel === "function" ? getSpekiStructureItemLabel(...args) : "", getSpekiStructureTableRows: (...args) => typeof getSpekiStructureTableRows === "function" ? getSpekiStructureTableRows(...args) : [],
  getWorkCenter,
  getWorkCenterManualCapacity,
  getWorkCenterUnitsPerHour,
  getWorkOrderPlanningStatus,
  getWorkOrderPlanningStatusValue: (route = {}) => { const rawStatus = String(route?.planningStatus || "").trim(); return WORK_ORDER_PLANNING_STATUS_VALUES.has(rawStatus) ? rawStatus : "queued"; },
  icon,
  isGanttSlotCompleted: (slot = {}) => slot?.status === "completed" || slot?.completed === true,
  isManufacturingOutputReceiptRouteStep,
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
  snapToWorkingTime: (...args) => typeof snapToWorkingTime === "function" ? snapToWorkingTime(...args) : args[1],
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

function getPlanningTableSlotRows() {
  const stepById = new Map((planningState.routeSteps || []).map((step) => [step.id, step]));
  const warningsContext = getSlotWarnings(planningState);
  const slotWarningMap = warningsContext.slotWarningMap || {};

  return (planningState.slots || [])
    .map((slot) => {
      const step = stepById.get(slot.routeStepId) || null;
      const route = getPlanningTableSlotRoute(slot, step);
      const routeId = route?.id || getSlotRouteId(slot, planningState);
      const task = route && step ? getRouteStepPlanningTask(route, step) : null;
      const status = getGanttSlotStatusView(slot);
      const workCenterId = mapLegacyWorkCenterId(getSlotGanttWorkCenterId(slot) || slot.workCenterId || step?.workCenterId || "");
      const workCenter = getWorkCenter(workCenterId) || getWorkCenter(slot.workCenterId) || null;
      const resource = getGanttResourceForSlot(slot);
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
  if (weeklyPlanningPeriodState.key === key && Array.isArray(weeklyPlanningPeriodState.rows)) {
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
function initializeRoutesRenderModule() {
  ({
    getWorkOrderPrintPackageViewModel,
    getRouteTaskTypeLabel,
    renderDirectoryPage,
    renderRoutePrintPreviewModal,
    renderRouteTreeCell,
    renderRoutesPage,
    renderWorkOrderPrintPackageModal,
  } = createRoutesRenderModule({
  MAIN_ROUTE_TASK_ID,
  distance,
  escapeHtml,
  formatDateTimeShort,
  formatReportNumber,
  formatShiftWorkOrderPersonName: (...args) => formatShiftWorkOrderPersonName(...args),
  getActiveRouteForModule,
  getActiveSpecificationForModule,
  getDefaultOperationMapItemForRouteKind,
  getDirectoryData,
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
  getShiftMasterEmployee,
  getShiftWorkOrderJournalViewModel: (...args) => getShiftWorkOrderJournalViewModel(...args),
  getSmtLineConfigurations,
  getVisibleDirectoryGroups,
  getVisibleDirectorySections,
  getWorkCenter,
  getWorkCenterUnitsPerHour,
  getWorkOrderViewModel,
  icon,
  isManufacturingOutputReceiptRouteStep,
  isSmtOperationWorkCenter,
  isWarehouseWorkCenterId,
  mapLegacyWorkCenterId,
  normalizeBoardsPerPanel,
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
  renderDirectoryTable: (...args) => renderDirectoryTable(...args),
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
  routesRenderModuleLoad = import("./modules/routes/render.js")
    .then(({ createRoutesRenderModule }) => {
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

let getShiftWorkOrderRows, getShiftMasterBoardSlotRows, groupShiftRowsByWorkCenter, groupShiftRowsByOrder, getDispatchWindow, getShiftWorkbenchWindow, getShiftWindowDayCount, renderShiftWindowRuler, normalizeDateInput, setShiftWorkbenchDate, moveShiftWorkbenchDate, setShiftWorkbenchToday, renderShiftCalendarControl, isSlotInsideDispatchWindow, getDispatchSlotTone, getDispatchSlotWindowStyle, buildDispatchWorkCenterRows, buildDispatchRouteRows, buildDispatchSignals, getDispatchCheckpointReferenceTime, buildDispatchCheckpoints, buildDispatchBoardData, normalizeShiftMasterBoardQuantity, getShiftMasterBoardAssignment, getShiftMasterBoardFact, getShiftMasterBoardAssignmentQuantity, getShiftMasterBoardRowById, getShiftMasterBoardNextRouteStep, getShiftMasterBoardTransferTarget, getShiftMasterBoardCarryoverForSource, buildShiftMasterBoardTransferContract, buildShiftMasterBoardSheetContract, getShiftMasterBoardLaborMinutesPerUnit, getShiftMasterBoardTimesheetCapacity, getShiftMasterBoardLaneId, getShiftMasterBoardRow, getShiftMasterBoardGroupKey, groupShiftMasterBoardRows, getShiftMasterBoardWeek, getShiftMasterBoardCarryoverRows, getShiftMasterBoardFallbackRows, getShiftMasterBoardModel, getShiftMasterBoardExecutorLoadMap, renderShiftMasterBoardPage, renderShiftMasterBoardTopControls, renderShiftMasterBoardKpi, renderShiftMasterBoardLanes, renderShiftMasterBoardLane, renderShiftMasterBoardCard, renderShiftMasterBoardDetail, renderShiftMasterBoardTaskContext, renderShiftMasterBoardInlineSummary, renderShiftMasterBoardSummaryCell, getShiftMasterBoardRouteChain, renderShiftMasterBoardRouteChain, renderShiftMasterBoardCoverage, renderShiftMasterBoardEmployeeOptions, renderShiftMasterBoardAvailableEmployeeLoadbar, renderShiftMasterBoardAssignment, renderShiftMasterBoardDocument, renderShiftMasterBoardSheetModal, renderShiftMasterBoardActionModal, getShiftMasterDemoLanes, getShiftMasterRowOrderLabel, getShiftMasterRowRouteLabel, getShiftMasterRowRoutePartLabel, readShiftMasterBoardAssignmentPanel, readShiftMasterBoardCurrentAssignmentPatch, mergeShiftMasterBoardIssueAssignment, persistShiftMasterBoardAssignmentInput, updateShiftMasterBoardAvailableQuantityPreview, updateShiftMasterBoardLane, canMoveShiftMasterBoardCardToLane, moveShiftMasterBoardCardToLane, saveShiftMasterBoardAssignment, saveShiftMasterBoardFact, removeShiftMasterBoardCarryoverForSource, createShiftMasterBoardCarryover, bindShiftMasterBoardEvents;
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
  getSlotGanttWorkCenterId: (...args) => getSlotGanttWorkCenterId(...args),
  getSlotPlanningOrderId,
  getSlotRoute: (...args) => getSlotRoute(...args),
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

renderShiftMasterBoardPage = () => renderMesModulePatternPage({
  moduleId: "shiftMasterBoard",
  content: renderUiEmptyState({ title: "Загружаем мастерскую", description: "Рабочее пространство откроется автоматически." }),
});
renderShiftMasterBoardSheetModal = () => "";
renderShiftMasterBoardActionModal = () => "";
bindShiftMasterBoardEvents = () => {};
let shiftMasterBoardModuleLoad = null;
let shiftMasterBoardModuleError = null;

function ensureShiftMasterBoardModule() {
  if (shiftMasterBoardModuleLoad || shiftMasterBoardModuleError) return shiftMasterBoardModuleLoad;
  shiftMasterBoardModuleLoad = import("./modules/shift_master_board/render.js")
    .then(({ createShiftMasterBoardModule }) => {
      initializeShiftMasterBoardModule(createShiftMasterBoardModule);
      if (ui.activeModule === "shiftMasterBoard") render({ skipRememberScroll: true });
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
let weeklyPlanningPeriodModuleLoad = null;
let weeklyPlanningPeriodState = { key: "", rows: null, loading: false, stale: false, epoch: 0, error: "", fallbackReason: "" };
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
  if (planningPeriodReadModel && buildWeeklyPlanningPeriodRows) return Promise.resolve(true);
  if (weeklyPlanningPeriodModuleLoad) return weeklyPlanningPeriodModuleLoad;
  weeklyPlanningPeriodModuleLoad = Promise.all([
    import("./modules/domain_api/planning_period_read_model.js"),
    import("./modules/weekly_production_control/planning_period_rows.js"),
  ]).then(([
    { createPlanningPeriodReadModel },
    { buildWeeklyPlanningPeriodRows: buildRows },
  ]) => {
    planningPeriodReadModel = createPlanningPeriodReadModel();
    buildWeeklyPlanningPeriodRows = buildRows;
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

function clearWeeklyPlanningPeriodRefreshTimer() {
  if (weeklyPlanningPeriodRefreshTimer !== null) clearTimeout(weeklyPlanningPeriodRefreshTimer);
  weeklyPlanningPeriodRefreshTimer = null;
}

function scheduleWeeklyPlanningPeriodRefresh(bounds) {
  clearWeeklyPlanningPeriodRefreshTimer();
  if (ui?.activeModule !== "weeklyProductionControl" || !planningPeriodReadModel) return;
  const status = planningPeriodReadModel.getStatus(bounds);
  const delay = Math.max(5_000, Number(status.freshUntil || 0) - Date.now());
  weeklyPlanningPeriodRefreshTimer = setTimeout(() => {
    weeklyPlanningPeriodRefreshTimer = null;
    if (ui?.activeModule !== "weeklyProductionControl") return;
    weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, stale: true };
    hydrateWeeklyPlanningPeriod();
  }, delay);
}

function invalidateWeeklyPlanningPeriod() {
  if (!weeklyPlanningPeriodState.key) return;
  weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, stale: true, epoch: Number(weeklyPlanningPeriodState.epoch || 0) + 1 };
  if (ui?.activeModule === "weeklyProductionControl") hydrateWeeklyPlanningPeriod();
}

function setPlanningStateAndInvalidate(nextState) {
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
  const requestEpoch = Number(weeklyPlanningPeriodState.epoch || 0);
  const force = weeklyPlanningPeriodState.stale;
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
    if (!result?.ok || !result.projection || typeof buildWeeklyPlanningPeriodRows !== "function") {
      weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, loading: false, stale: true, error: result?.error || "Weekly planning period API is unavailable" };
      scheduleWeeklyPlanningPeriodRefresh(bounds);
      return;
    }
    const lookups = getWeeklyPlanningPeriodLookups();
    weeklyPlanningPeriodState = {
      key: bounds.key,
      rows: buildWeeklyPlanningPeriodRows(result.projection, {
        toDate,
        mapWorkCenterId: mapLegacyWorkCenterId,
        ...lookups,
      }),
      loading: false,
      stale: false,
      epoch: requestEpoch,
      error: "",
      fallbackReason: String(result.fallbackReason || ""),
    };
    scheduleWeeklyPlanningPeriodRefresh(bounds);
    if ((!hadRows || result.changed) && ui.activeModule === "weeklyProductionControl") render({ skipRememberScroll: true });
  }).catch(() => {
    if (weeklyPlanningPeriodState.key !== bounds.key) return;
    weeklyPlanningPeriodState = { ...weeklyPlanningPeriodState, loading: false, stale: true, error: "Weekly planning period API is unavailable" };
    scheduleWeeklyPlanningPeriodRefresh(bounds);
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

let bindProductionStructureMatrixEvents = () => {};
let getProductionStructureMatrixRuntimeOverrides = () => normalizePlainRecord(ui?.productionStructureMatrixOverrides);
let renderProductionStructureMatrixPage = () => renderUiModulePage({
  ariaLabel: "Структура производства",
  className: "production-structure-matrix-page",
  content: renderUiEmptyState({ title: "Загружаем структуру производства", description: "Полная матрица открывается только по запросу." }),
});
let productionStructureMatrixModuleLoad = null;
function initializeProductionStructureMatrixModule(factory, matrixData) {
  ({
    bindProductionStructureMatrixEvents,
    getProductionStructureMatrixRuntimeOverrides,
    renderProductionStructureMatrixPage,
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
  productionStructureMatrixModuleLoad = Promise.all([
    import("./modules/production_structure_matrix/render.js"),
    import("./production_structure_matrix_data.js"),
    ensureLegacyProductionStructure(),
  ]).then(([{ createProductionStructureMatrixModule }, matrixData]) => {
    initializeProductionStructureMatrixModule(createProductionStructureMatrixModule, matrixData);
    if (ui.activeModule === "productionStructureMatrix") render();
  }).catch((error) => {
    console.error("Не удалось загрузить структуру производства", error);
    renderProductionStructureMatrixPage = () => renderUiModulePage({
      ariaLabel: "Структура производства",
      className: "production-structure-matrix-page",
      content: renderUiEmptyState({ title: "Модуль недоступен", description: "Обновите страницу и повторите попытку." }),
    });
    if (ui.activeModule === "productionStructureMatrix") render();
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
let renderContourAdminPage = () => renderUiModulePage({
  ariaLabel: "Администрирование контура",
  className: "contour-admin-page",
  content: renderUiEmptyState({ title: "Загружаем модуль", description: "Экран администрирования откроется автоматически." }),
});
let contourAdminModuleLoad = null;

function initializeContourAdminModule(factory) {
  ({
    bindContourAdminEvents,
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
            <span class="startup-error-logo">M</span>
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


let addNomenclatureToBom, applyGanttRowToSlot, bindProductsEvents, cancelAuthPrototypePinFeedback, checkSpekiStructureReferences, clearSpekiStaleItem, completeAuthPrototypeLogin, createSpekiSpecification, deleteBomImportRow, ensureNomenclatureTypeExists, ensureRouteModuleProjectForSpecification, findSmtLineByNumber, getActiveSpecificationForModule, getAuthPrototypeAttemptsLeft, getAuthPrototypeDepartmentRows, getAuthPrototypeDirectDepartmentPeople, getAuthPrototypePeople, getAuthPrototypePeopleByUnit, getAuthPrototypePinFeedbackTone, getAuthPrototypePinPerson, getAuthPrototypeSelectedDepartment, getAuthPrototypeSelectedPerson, getAuthPrototypeSelectedUnit, getAuthPrototypeUnitRows, getBomImportRowNomenclatureItem, getBomImportRows, getBomLinkedSpecifications, getBomList, getBomResultNomenclatureItem, getDefaultSmtLineConfigurations, getDirectoryRows, getFallbackNomenclatureType, getGanttResourceForSlot, getNomenclatureDeleteUsage, getNomenclatureItem, getResourceBaseCph, getResourceRowId, getResourcesForWorkCenter, getRouteBindingContext, getRouteBindingModeForSelection, getRouteBindingOptions, getRouteBomList, getRouteDocumentKind, getRouteDocumentKindLabel, getRouteDocumentKindShortLabel, getRouteLineageSubjectName, getRouteModuleSelectionName, getRouteModuleSelectionValue, getRouteParentRoute, getRouteRootRoute, getRouteScopeRootTask, getRouteSpecification, getRoutesForModule, getSlotGanttResourceId, getSlotGanttWorkCenterId, getSmtLineConfigurations, getSmtLineIdFromWorkCenterId, getSmtLineNumberFromText, getSpecificationBomEntries, getSpecificationById, getSpecificationDeleteUsage, getSpecificationItemBomId, getSpecificationProductionOrder, getSpekiStructureItemDisplayName, getSpekiStructureItemLabel, getSpekiStructureSectionOptions, getSpekiStructureTableRows, importBomFromXlsxFile, inferAccessRoleIdForPerson, isAuthPrototypePinFeedbackLocked, isSmtLineWorkCenterId, migrateSpecificationBomRowsToNomenclature, normalizeBomImportRow, normalizeLookupText, normalizeNomenclatureType, normalizeRouteBindingValue, normalizeSmtComponentKeyPart, renderModulePreviewEmpty, renderNomenclaturePage, renderProductsPage, resetAuthPrototypeAttempts, resolveRouteModuleProjectId, scheduleAuthPrototypePinValidation, scopeRouteTasks, summarizeBomComponentFields, syncNomenclatureTypeRename, syncNomenclatureTypesFromItems, syncSpecificationDerivedFields, toggleSpekiBomCollapse, updateBomImportCell, upsertBomResultToNomenclature;
let bindSpecifications2Events = () => {};
let renderSpecifications2Page = () => renderUiModulePage({
  ariaLabel: "Спецификации 2.0",
  className: "specifications2-page",
  content: renderUiEmptyState({ title: "Загружаем модуль", description: "Спецификация откроется автоматически." }),
});
let specifications2ModuleLoad = null;
let specifications2RevisionsReadModel = null;
let specifications2PublishCommands = null;
let specifications2AttachmentCommands = null;
function getSpecifications2PublishedRevision(sourceEntryId) {
  return specifications2RevisionsReadModel?.getBySource?.(sourceEntryId) || null;
}
function hydrateSpecifications2PublishedRevision(entry) {
  if (!entry?.publication?.revision || !entry?.id) return;
  void ensureSpecifications2Module().then(() => specifications2RevisionsReadModel?.refreshBySource?.(entry.id) || { ok: false }).then((result) => {
    if (result.ok && result.changed && ui.activeModule === "specifications2") render();
  });
}
normalizeLookupText = (value) => String(value || "").trim().toLowerCase();
function bindSpekiEvents(...args) { return appEventsService.bindSpekiEvents(...args); }
function initializeSpecifications2Module(factory, buildSpecifications2Publication) {
  ({
    bindSpecifications2Events,
    renderSpecifications2Page,
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
    publishSpecifications2Entry: (entry) => {
      const result = buildSpecifications2Publication(entry, { directoryState, planningState });
      directoryState = normalizeDirectoryState(result.directoryState);
      planningState = normalizePlanningState(result.planningState);
      invalidateWeeklyPlanningPeriod();
      persistDirectoryState();
      persistState();
      return result.publication;
    },
    publishServerRevision: (entry) => specifications2PublishCommands?.publishRevision?.({ entry }) || Promise.resolve({ ok: false, error: "Specifications 2.0 server client is unavailable" }),
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
    bindProductsEvents,
    cancelAuthPrototypePinFeedback,
    checkSpekiStructureReferences,
    clearSpekiStaleItem,
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
    renderProductsPage,
    resetAuthPrototypeAttempts,
    resolveRouteModuleProjectId,
    scheduleAuthPrototypePinValidation,
    scopeRouteTasks,
    summarizeBomComponentFields,
    syncNomenclatureTypeRename,
    syncNomenclatureTypesFromItems,
    syncSpecificationDerivedFields,
    toggleSpekiBomCollapse,
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
  getAuthPrototypePinFeedbackSequence: () => authPrototypePinFeedbackSequence,
  getAuthPrototypePinFeedbackTimer: () => authPrototypePinFeedbackTimer,
  setAuthPrototypePinFeedbackSequence: (nextValue) => { authPrototypePinFeedbackSequence = nextValue; },
  setAuthPrototypePinFeedbackTimer: (nextValue) => { authPrototypePinFeedbackTimer = nextValue; },
  bindSpekiEvents,
  dedupeProductionResources,
  escapeAttribute,
  escapeHtml,
  formatReportNumber,
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
let saveAuthSessionTaskReport = () => false;
let setAuthSessionFactDraft = () => {};
let setAuthSessionReportDraft = () => {};
let bindAuthPrototypeEvents = () => {};
let bindAuthSessionEvents = () => {};
let authRenderModuleLoad = null;
let authEventsModuleLoad = null;
let authModulesReady = false;
function initializeAuthRenderModule(factory) {
  ({
    doesAuthSessionFactNeedDeviationComment,
    getAuthPrototypeSelectedExecutor,
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
  ({ bindAuthPrototypeEvents, bindAuthSessionEvents } = factory({
    app,
    AUTH_PIN_TEMPORARILY_DISABLED,
    bindGenericModalCloseEvents,
    button: null,
    cancelAuthPrototypePinFeedback,
    completeAuthPrototypeLogin,
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
    saveShiftMasterBoardFact,
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
let formatTimesheetHours = (value = 0) => String(Number(value || 0));
let getTimesheetCell = () => ({ value: "work", code: "work", hours: 8, overtime: 0 });
let getTimesheetDayOption = (value = "work") => ({ value, label: value });
let getTimesheetEmployeeSchedule = () => null;
let getTimesheetModel = () => ({ rows: [] });
let renderTimesheetEditorModal = () => "";
let renderTimesheetPage = () => renderUiModulePage({
  ariaLabel: "Табель",
  content: renderUiEmptyState({ title: "Загружаем табель", description: "Экран откроется автоматически." }),
});
let timesheetModuleLoad = null;
function initializeTimesheetModule(factory) {
  ({
    bindTimesheetEvents,
    formatTimesheetHours,
    getTimesheetCell,
    getTimesheetDayOption,
    getTimesheetEmployeeSchedule,
    getTimesheetModel,
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
let syncPlanningManualLaborToStepSlots = () => false;
let planningWorkbenchModuleLoad = null;
let planningWorkbenchModuleError = null;
function initializePlanningWorkbenchModule(factory) {
  ({
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
function hydrateSharedStateForModule(moduleId, valueKeys = []) {
  const keys = [...new Set(valueKeys.filter(Boolean))];
  if (!moduleId || !keys.length) return;
  const hydrationKey = `${moduleId}:${keys.slice().sort().join(",")}`;
  if (sharedStateModuleHydrations.has(hydrationKey)) return;
  sharedStateModuleHydrations.add(hydrationKey);
  void runtimeStateService?.hydrateSharedStateValues?.(keys).then((hydrated) => {
    // A user can switch modules while the initial shared-state handshake is
    // still running.  Do not cache that temporary miss: the render triggered
    // after bootstrap must be able to request the deferred projection again.
    if (!hydrated) {
      sharedStateModuleHydrations.delete(hydrationKey);
      return;
    }
    if (keys.includes(DIRECTORY_STORAGE_KEY)) {
      directoryState = loadDirectoryState();
      ensureStatusDirectoryDefaults();
    }
    if (keys.includes(SYSTEM_DOMAINS_STORAGE_KEY)) {
      reloadSystemDomainsState({
        source: "shared-module-hydration",
        storageKey: SYSTEM_DOMAINS_STORAGE_KEY,
        snapshotVersion: null,
      });
      hydrateSystemDomainsServerRead(moduleId);
    }
    if (ui.activeModule === moduleId) render({ skipRememberScroll: true });
  }).catch(() => {
    // A local projection remains usable if a deferred remote read fails.
  });
}

// The planning workbench already reads its list and active order from the
// compact server projection. Keep the large compatibility System Domains
// snapshot off its navigation path; only placement needs the complete
// calendar/resource model.
async function ensurePlanningSystemDomains() {
  const hydrated = await runtimeStateService?.hydrateSharedStateValues?.([SYSTEM_DOMAINS_STORAGE_KEY]);
  if (!hydrated) return false;
  reloadSystemDomainsState({
    source: "planning-scheduling-hydration",
    storageKey: SYSTEM_DOMAINS_STORAGE_KEY,
    snapshotVersion: null,
  });
  hydrateSystemDomainsServerRead("planning");
  return true;
}
let workOrdersReadModel = null;
let planningRuntimeProjectionReadModel = null;
let canApplyPlanningRuntimeProjection = () => false;
let planningDomainApiModuleLoad = null;
let planningRuntimeProjectionState = { status: "idle", error: "", revision: 0 };
const systemDomainsReadModel = createSystemDomainsReadModel();
const systemDomainsCommands = createSystemDomainsCommands();
let shiftExecutionReadModel = null;
let shiftExecutionCommands = null;
let shiftExecutionOutbox = null;
let buildShiftMasterBoardAssignmentWrite = null;
let buildShiftMasterBoardFactWrite = null;
let buildShiftMasterBoardCarryoverWrite = null;
let executeShiftMasterBoardServerWrite = null;
let projectShiftExecutionServerProjection = null;
let shiftExecutionDomainApiModuleLoad = null;
let shiftExecutionServerState = { status: "idle", primaryPostgres: false, schemaReady: false, commandsEnabled: false, error: "" };
let shiftExecutionOutboxFlushInFlight = false;
let systemDomainsServerReadState = { status: "idle", error: "", revision: 0 };
let systemDomainsServerCommandState = { status: "idle", enabled: false, surfaces: [], error: "" };
let systemDomainsServerCapabilitiesPromise = null;
const SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES = ["production-structure", "timesheet", "access-control"];
function hasSystemDomainsServerAuthority() {
  return systemDomainsServerCommandState.enabled === true
    && SYSTEM_DOMAINS_SERVER_COMMAND_SURFACES.every((surface) => systemDomainsServerCommandState.surfaces.includes(surface));
}
function hydrateSystemDomainsServerCommands() {
  if (systemDomainsServerCommandState.status === "ready") return Promise.resolve(systemDomainsServerCommandState);
  if (systemDomainsServerCapabilitiesPromise) return systemDomainsServerCapabilitiesPromise;
  systemDomainsServerCommandState = { ...systemDomainsServerCommandState, status: "loading", error: "" };
  systemDomainsServerCapabilitiesPromise = systemDomainsCommands.getCapabilities().then((result) => {
    systemDomainsServerCommandState = {
      status: "ready",
      enabled: result.ok && result.enabled === true,
      surfaces: result.ok && Array.isArray(result.capabilities?.serverCommandSurfaces) ? result.capabilities.serverCommandSurfaces : [],
      error: result.ok ? "" : (result.error || "System Domains command capabilities are unavailable"),
    };
    return systemDomainsServerCommandState;
  }).catch(() => {
    systemDomainsServerCommandState = { status: "ready", enabled: false, surfaces: [], error: "System Domains command capabilities are unavailable" };
    return systemDomainsServerCommandState;
  });
  return systemDomainsServerCapabilitiesPromise;
}
function hydrateSystemDomainsServerRead(moduleId = "") {
  void Promise.all([systemDomainsReadModel.refresh(), hydrateSystemDomainsServerCommands()]).then(([result]) => {
    if (!result.ok || !result.item) {
      systemDomainsServerReadState = { status: "fallback", error: result.error || "", revision: 0 };
      return;
    }
    const loaded = loadSystemDomains(result.item);
    if (!hasActivatableSystemDomains(loaded.domains, loaded.report)) {
      systemDomainsServerReadState = { status: "fallback", error: "Server projection is not activatable", revision: 0 };
      return;
    }
    // Until every visible writer uses commands, a differing compatibility
    // snapshot remains safer than an incomplete server projection. Once all
    // three command surfaces are active, PostgreSQL is authoritative and an
    // older browser snapshot must never mask it.
    const localSignature = systemDomainsState ? serializeSystemDomains(systemDomainsState) : "";
    const serverSignature = serializeSystemDomains(loaded.domains);
    if (!hasSystemDomainsServerAuthority() && localSignature && localSignature !== serverSignature) {
      systemDomainsServerReadState = { status: "fallback", error: "Server projection differs from compatibility snapshot", revision: Number(result.revision || 0) };
      return;
    }
    activateSystemDomains(loaded.domains, { source: "server-read", report: loaded.report });
    systemDomainsServerReadState = { status: "server", error: "", revision: Number(result.revision || 0) };
    // Publish the narrow shared-state tombstone once PostgreSQL is confirmed
    // authoritative. The local cache remains available for fast startup; only
    // the obsolete cross-browser snapshot copy is retired.
    if (hasSystemDomainsServerAuthority()) persistUiState();
    if (moduleId && ui?.activeModule === moduleId) render({ skipRememberScroll: true });
  }).catch(() => {
    systemDomainsServerReadState = { status: "fallback", error: "System Domains read request failed", revision: 0 };
  });
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
async function hydratePlanningWorkbenchBootstrap({ force = false, renderOnChange = false } = {}) {
  if (!await ensurePlanningDomainApiModule()) return false;
  const result = await workOrdersReadModel.refresh({ force });
  if (!result.ok) return false;
  const activeRouteId = String(ui.activeRouteId || result.items?.[0]?.id || "");
  if (!ui.activeRouteId && activeRouteId) ui.activeRouteId = activeRouteId;
  if (activeRouteId) {
    const detailResult = await workOrdersReadModel.refreshDetail(activeRouteId, { force });
    if (!detailResult.ok) return false;
  }
  if (renderOnChange && result.changed && ui.activeModule === "planning") render();
  return true;
}
async function hydratePlanningRuntimeProjection({ force = false } = {}) {
  if (planningRuntimeProjectionState.status === "loading") return false;
  planningRuntimeProjectionState = { ...planningRuntimeProjectionState, status: "loading", error: "" };
  try {
    if (!await ensurePlanningDomainApiModule()) return false;
    const result = await planningRuntimeProjectionReadModel.refresh({ force });
    if (!result.ok || !result.projection) {
      planningRuntimeProjectionState = { status: "fallback", error: result.error || "Planning runtime projection is unavailable", revision: 0 };
      return false;
    }
    if (!canApplyPlanningRuntimeProjection(planningState, result.projection)) {
      planningRuntimeProjectionState = { status: "fallback", error: "Planning runtime projection differs from compatibility snapshot", revision: 0 };
      return false;
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
    if (ui?.activeModule === "planning" || ui?.activeModule === "gantt") render({ skipRememberScroll: true });
    return true;
  } catch {
    planningRuntimeProjectionState = { status: "fallback", error: "Planning runtime projection is unavailable", revision: 0 };
    return false;
  }
}
function hydrateShiftExecutionServerProjection() {
  if (shiftExecutionServerState.status === "loading") return;
  shiftExecutionServerState = { ...shiftExecutionServerState, status: "loading", error: "" };
  void ensureShiftExecutionDomainApiModule().then((ready) => ready
    ? Promise.all([shiftExecutionReadModel.refresh(), shiftExecutionCommands.refreshCapability()])
    : [{ ok: false, items: [] }, { ok: false, primaryPostgres: false, schemaReady: false, enabled: false, error: "Shift execution domain API module is unavailable" }]
  ).then(([projection, capability]) => {
    const wasAuthoritative = shiftExecutionServerState.status === "ready" && shiftExecutionServerState.commandsEnabled === true;
    shiftExecutionServerState = {
      status: projection.ok && capability.ok ? "ready" : "fallback",
      primaryPostgres: capability.primaryPostgres === true,
      schemaReady: capability.schemaReady === true,
      commandsEnabled: capability.enabled === true,
      // Do not replace the compatibility snapshot here. During rollout this
      // is a read-through health check; authority moves only with the command
      // bridge and explicit parity evidence.
      error: projection.ok && capability.ok ? "" : (projection.error || capability.error || "Shift execution server projection is unavailable"),
    };
    if (projection.ok && capability.enabled === true) {
      applyShiftExecutionServerProjection(projection.items);
      // Remove the local/shared compatibility maps only after a successful
      // aggregate read and an enabled server command path.  The server remains
      // the authority; a failed read never performs this cleanup.
      if (!wasAuthoritative) persistUiState();
      void flushShiftExecutionOutbox();
    }
    if (projection.ok && projection.changed && ui?.activeModule === "shiftMasterBoard") render({ skipRememberScroll: true });
  }).catch(() => {
    shiftExecutionServerState = { ...shiftExecutionServerState, status: "fallback", error: "Shift execution server projection is unavailable" };
  });
}
function ensureShiftExecutionDomainApiModule() {
  if (shiftExecutionReadModel && shiftExecutionCommands && shiftExecutionOutbox) return Promise.resolve(true);
  if (shiftExecutionDomainApiModuleLoad) return shiftExecutionDomainApiModuleLoad;
  shiftExecutionDomainApiModuleLoad = Promise.all([
    import("./modules/domain_api/shift_execution_read_model.js"),
    import("./modules/domain_api/shift_execution_commands.js"),
    import("./modules/shift_master_board/server_execution_bridge.js"),
    import("./modules/shift_master_board/server_projection_adapter.js"),
    import("./modules/shift_master_board/server_execution_outbox.js"),
  ]).then(([
    { createShiftExecutionReadModel },
    { createShiftExecutionCommands },
    bridge,
    { projectShiftExecutionServerProjection: projectProjection },
    { createShiftExecutionOutbox },
  ]) => {
    shiftExecutionReadModel = createShiftExecutionReadModel();
    shiftExecutionCommands = createShiftExecutionCommands();
    shiftExecutionOutbox = createShiftExecutionOutbox();
    ({
      buildShiftMasterBoardAssignmentWrite,
      buildShiftMasterBoardFactWrite,
      buildShiftMasterBoardCarryoverWrite,
      executeShiftMasterBoardServerWrite,
    } = bridge);
    projectShiftExecutionServerProjection = projectProjection;
    return true;
  }).catch((error) => {
    shiftExecutionDomainApiModuleLoad = null;
    shiftExecutionServerState = { ...shiftExecutionServerState, status: "fallback", error: error?.message || "Shift execution domain API module is unavailable" };
    return false;
  });
  return shiftExecutionDomainApiModuleLoad;
}
function applyShiftExecutionServerProjection(items = []) {
  if (!ui || !Array.isArray(items) || !projectShiftExecutionServerProjection) return false;
  const projection = projectShiftExecutionServerProjection(items);
  ui.shiftMasterBoardAssignments = projection.assignments;
  ui.shiftMasterBoardFacts = projection.facts;
  ui.shiftMasterBoardCarryovers = projection.carryovers;
  return true;
}
async function refreshShiftExecutionServerProjection() {
  if (!await ensureShiftExecutionDomainApiModule()) return { ok: false, error: "Shift execution domain API module is unavailable" };
  const result = await shiftExecutionReadModel.refresh({ force: true });
  if (result.ok) shiftExecutionServerState = { ...shiftExecutionServerState, status: "ready", error: "" };
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
  if (!shiftExecutionServerState.commandsEnabled || !row || !assignment) return { skipped: true };
  if (!await ensureShiftExecutionDomainApiModule()) return { ok: false, error: "Shift execution domain API module is unavailable" };
  let write = null;
  try {
    const serverAssignment = shiftExecutionReadModel.getBySourceRowId(row.id) || shiftExecutionReadModel.getBySourceSlotId(row.slotId || row.slot?.id);
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
async function mirrorShiftMasterBoardFactToServer(row, fact, carryover = null) {
  if (!shiftExecutionServerState.commandsEnabled || !row || !fact) return { skipped: true };
  if (!await ensureShiftExecutionDomainApiModule()) return { ok: false, error: "Shift execution domain API module is unavailable" };
  let write = null;
  try {
    const serverAssignment = shiftExecutionReadModel.getBySourceRowId(row.id) || shiftExecutionReadModel.getBySourceSlotId(row.slotId || row.slot?.id);
    write = buildShiftMasterBoardFactWrite(row, fact, serverAssignment);
    const result = await executeShiftMasterBoardServerWrite(shiftExecutionCommands, write);
    if (!result?.ok) throw new Error(result?.error || "Shift fact was not accepted by the server");
    await refreshShiftExecutionServerProjection();
    if (carryover) await mirrorShiftMasterBoardCarryoverToServer(row, carryover);
    return result;
  } catch (error) {
    if (write) shiftExecutionOutbox.enqueue(write, error?.message || "Shift fact server mirror failed");
    shiftExecutionServerState = { ...shiftExecutionServerState, status: "fallback", error: error?.message || "Shift fact server mirror failed" };
    return { ok: false, error: shiftExecutionServerState.error };
  }
}
async function mirrorShiftMasterBoardCarryoverToServer(row, carryover) {
  if (!shiftExecutionServerState.commandsEnabled || !row || !carryover) return { skipped: true };
  if (!await ensureShiftExecutionDomainApiModule()) return { ok: false, error: "Shift execution domain API module is unavailable" };
  let write = null;
  try {
    const serverAssignment = shiftExecutionReadModel.getBySourceRowId(row.id) || shiftExecutionReadModel.getBySourceSlotId(row.slotId || row.slot?.id);
    write = buildShiftMasterBoardCarryoverWrite(carryover, serverAssignment);
    const result = await executeShiftMasterBoardServerWrite(shiftExecutionCommands, write);
    if (!result?.ok) throw new Error(result?.error || "Shift carryover was not accepted by the server");
    await refreshShiftExecutionServerProjection();
    return result;
  } catch (error) {
    if (write) shiftExecutionOutbox.enqueue(write, error?.message || "Shift carryover server mirror failed");
    shiftExecutionServerState = { ...shiftExecutionServerState, status: "fallback", error: error?.message || "Shift carryover server mirror failed" };
    return { ok: false, error: shiftExecutionServerState.error };
  }
}
function hydratePlanningWorkOrderDetail(routeId) {
  if (!routeId) return;
  void ensurePlanningDomainApiModule().then((ready) => ready ? workOrdersReadModel.refreshDetail(routeId) : { ok: false }).then((result) => {
    if (result.ok && result.changed && ui.activeModule === "planning") render();
  });
}
async function changePlanningRouteQuantity(routeId, quantity, options = {}) {
  if (!await ensurePlanningDomainApiModule()) return syncPlanningRouteQuantity(routeId, quantity, options);
  const route = (planningState?.routes || []).find((item) => item.id === routeId);
  const projected = workOrdersReadModel.getItems().find((item) => String(item.id) === String(routeId));
  const expectedRevision = Number(projected?.concurrencyRevision ?? route?.domainConcurrencyRevision);
  if (!route || !Number.isInteger(expectedRevision)) {
    return syncPlanningRouteQuantity(routeId, quantity, options);
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
    return syncPlanningRouteQuantity(routeId, quantity, {
      ...options,
      domainConcurrencyRevision: result.item.concurrencyRevision,
      // PostgreSQL has already committed the command and the API outbox
      // mirrors the authoritative projection into shared state. Recalculate
      // only the open screen here; a second browser write could overwrite the
      // server-calculated duration or race with the outbox.
      persist: false,
    });
  }
  if (result.kind === "unavailable") {
    return syncPlanningRouteQuantity(routeId, quantity, options);
  }
  if (result.kind === "conflict") {
    await Promise.all([
      workOrdersReadModel.refresh({ force: true }),
      workOrdersReadModel.refreshDetail(routeId, { force: true }),
    ]);
    notifySaveSuccess("Количество уже изменено в другом сеансе. Экран обновлён.");
    render();
  }
  return false;
}
async function changePlanningSlotSchedule(routeId, operationId, plannedStart) {
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
    render();
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
    activateSystemDomains(candidate, { source });
    return persistSystemDomainsState({ push, reason });
  }
  return (async () => {
    // A form is allowed to write to PostgreSQL only when its compatibility
    // snapshot is exactly the projection that the command will replace. This
    // protects still-unmigrated forms from being silently overwritten.
    const current = await systemDomainsReadModel.refresh();
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
  return {
    ...(systemDomainsMigrationReport || {}),
    lastReloadSource: systemDomainsLastReloadSource,
    validation: systemDomainsState ? validateSystemDomains(systemDomainsState) : { valid: false, errors: [{ code: "not-loaded" }] },
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
          { ...employeeEntity, id, updatedAt: new Date().toISOString() },
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
  return updateSystemDomainRegistry(normalizedRegistryName, (rows) => [
    ...rows.filter((row) => row.id !== id),
    { ...entity, id, updatedAt: new Date().toISOString() },
  ], { source: options.source, serverCommand: options.serverCommand !== false, surface: options.surface || "production-structure" });
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
  if (!systemDomainsState) return null;
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
  return authorizeSystemDomainAction("directories", "edit", { resourceId: normalizedSectionId });
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
function persistState(...args) { return runtimeStateService.persistState(...args); }
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
  alignGanttWindowToPlan,
  appendLocalDataSafetyAudit,
  createDefaultPlanningState,
  getActiveInterfaceRole,
  getBootstrapSnapshotCountsFromState,
  isMeaningfulBootstrapSnapshotCounts,
  isUsableBootstrapSnapshotPayload,
  isShiftExecutionServerAuthoritative: () => shiftExecutionServerState.status === "ready" && shiftExecutionServerState.commandsEnabled === true,
  isSystemDomainsServerAuthoritative: () => systemDomainsServerReadState.status === "server" && hasSystemDomainsServerAuthority(),
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
  onPlanningBootstrap: () => hydratePlanningWorkbenchBootstrap(),
  onPlanningSnapshotSynchronized: () => hydratePlanningWorkbenchBootstrap({ renderOnChange: true }),
  persistUiState,
  publishBootPerformance,
  reloadSystemDomainsState,
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
  isShiftExecutionServerAuthoritative: () => shiftExecutionServerState.status === "ready" && shiftExecutionServerState.commandsEnabled === true,
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
  routeMatchesGanttFilters: (...args) => typeof routeMatchesGanttFilters === "function" ? routeMatchesGanttFilters(...args) : true,
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
        return renderDirectoryPage();
      },
      bind: () => bindDirectoryEvents(),
    },
    specifications2: {
      render: () => {
        ensureSpecifications2Module();
        return renderSpecifications2Page();
      },
      bind: () => bindSpecifications2Events(),
    },
    authPrototype: {
      render: () => { ensureAuthModules(); return renderAuthPrototypePage(); },
      bind: () => bindAuthPrototypeEvents(),
    },
    authSessionPrototype: {
      render: () => { ensureAuthModules(); return renderAuthSessionPrototypePage(); },
      renderModals: () => renderAuthSessionModal(),
      bind: () => {
        bindAuthPrototypeEvents();
        bindAuthSessionEvents();
      },
    },
    weeklyProductionControl: {
      initialize: () => getWeeklyProductionControlRuntimeInstance(),
      publicPorts: [
        "formatWeeklyProductionControlPercent",
        "formatWeeklyProductionControlQuantity",
        "getWeeklyProductionControlModel",
      ],
      render: (instance) => {
        hydrateWeeklyPlanningPeriod();
        return instance.renderWeeklyProductionControlPage();
      },
      bind: (instance) => instance.bindWeeklyProductionControlEvents(),
    },
    productionStructureMatrix: {
      render: () => {
        hydrateSharedStateForModule("productionStructureMatrix", [SYSTEM_DOMAINS_STORAGE_KEY]);
        ensureProductionStructureMatrixModule();
        return renderProductionStructureMatrixPage();
      },
      bind: () => bindProductionStructureMatrixEvents(),
    },
    timesheet: {
      render: () => {
        hydrateSharedStateForModule("timesheet", [SYSTEM_DOMAINS_STORAGE_KEY]);
        ensureTimesheetModule();
        return renderTimesheetPage();
      },
      renderModals: () => renderTimesheetEditorModal(),
      bind: () => bindTimesheetEvents(),
    },
    roles: {
      render: () => {
        hydrateSharedStateForModule("roles", [SYSTEM_DOMAINS_STORAGE_KEY]);
        ensureAccessRolesModule();
        return renderAccessRolesPage();
      },
      bind: () => bindAccessRolesEvents(),
    },
    contourAdmin: {
      render: () => {
        ensureContourAdminModule();
        return renderContourAdminPage();
      },
      bind: () => bindContourAdminEvents(),
    },
    nomenclature: {
      render: () => {
        hydrateSharedStateForModule("nomenclature", [DIRECTORY_STORAGE_KEY]);
        void ensureNomenclatureRenderModule();
        return renderNomenclaturePage();
      },
      bind: () => {
        bindNomenclatureEvents();
        bindBomListsEvents();
      },
    },
    planning: {
      render: () => {
        hydratePlanningWorkOrderReadModel();
        hydratePlanningWorkOrderDetail(ui.activeRouteId || "");
        ensurePlanningWorkbenchModule();
        if (planningWorkbenchModuleError) {
          return renderPlanningWorkbenchShellState({
            title: "Не удалось загрузить заказ-наряды",
            description: "Обновите страницу. Если ошибка повторится, передайте время появления в поддержку.",
          });
        }
        return renderPlanningWorkbenchPage();
      },
      bind: () => bindPlanningEvents(),
      afterRender: () => schedulePlanningRouteStructureSidebarSync(),
    },
    shiftMasterBoard: {
      render: () => {
        hydrateSharedStateForModule("shiftMasterBoard", [SYSTEM_DOMAINS_STORAGE_KEY]);
        hydrateShiftExecutionServerProjection();
        ensureShiftMasterBoardModule();
        if (shiftMasterBoardModuleError) {
          return renderMesModulePatternPage({
            moduleId: "shiftMasterBoard",
            content: renderUiEmptyState({ title: "Не удалось загрузить мастерскую", description: "Обновите страницу. Если ошибка повторится, передайте время появления в поддержку." }),
          });
        }
        return renderShiftMasterBoardPage();
      },
      renderModals: () => `${renderShiftMasterBoardSheetModal()}${renderShiftMasterBoardActionModal()}`,
      bind: () => bindShiftMasterBoardEvents(),
    },
    shiftWorkOrders: {
      render: () => {
        hydrateSharedStateForModule("shiftWorkOrders", [SYSTEM_DOMAINS_STORAGE_KEY]);
        ensureShiftWorkOrdersModule();
        if (shiftWorkOrdersModuleError) {
          return renderMesModulePatternPage({
            moduleId: "shiftWorkOrders",
            content: renderUiEmptyState({ title: "Не удалось загрузить модуль", description: "Обновите страницу. Если ошибка повторится, передайте время появления в поддержку." }),
          });
        }
        return renderShiftWorkOrdersPage();
      },
      renderModals: () => `${renderShiftWorkOrderPrintPreviewModal()}${renderShiftWorkOrderIssuePhotoModal()}${renderWorkOrderPrintPackageModal()}`,
      bind: () => bindShiftWorkOrdersEvents(),
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
    app.innerHTML = renderUiAppShell({
      pageId: "gantt",
      className: "planning-app-shell planning-gantt-shell",
      blueprint: getMesModuleBlueprintDefinition("gantt"),
      body: `
        <section class="planner-workspace planner-workspace-gantt-only" data-layout="planning-page" aria-label="Рабочая область планирования">
          ${renderToolbar()}
          <section class="planner-frame" aria-label="Производственный план">
            <div class="gantt-shell ${ui.ganttDependencyEditMode ? "is-dependency-editing" : ""}" data-layout="gantt" data-gantt-shell data-ui-component="GanttRuntime" data-ui-runtime="gantt-v1">
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
  getCalendarWorkCenterId: (...args) => typeof getCalendarWorkCenterId === "function" ? getCalendarWorkCenterId(...args) : args[0],
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
  getSlotRoute: (...args) => getSlotRoute(...args),
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
  migrateLegacy: startupDataMigrationRequired,
}));
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
function getDirectoryFieldClassKey(...args) { return appEventsService.getDirectoryFieldClassKey(...args); }
function getDirectoryTableCellClass(...args) { return appEventsService.getDirectoryTableCellClass(...args); }
function renderDirectoryTableHead(...args) { return appEventsService.renderDirectoryTableHead(...args); }
function renderDirectoryColumnFilter(...args) { return appEventsService.renderDirectoryColumnFilter(...args); }
function renderDirectoryEditorModal(...args) { return appEventsService.renderDirectoryEditorModal(...args); }
function renderDirectoryReaderModal(...args) { return appEventsService.renderDirectoryReaderModal(...args); }
function renderDirectoryTable(...args) { return appEventsService.renderDirectoryTable(...args); }
function getDirectoryTableRowClass(...args) { return appEventsService.getDirectoryTableRowClass(...args); }
function renderDirectoryCellContent(...args) { return appEventsService.renderDirectoryCellContent(...args); }
function getStatusUsedInText(...args) { return appEventsService.getStatusUsedInText(...args); }
function getStatusImpactView(...args) { return appEventsService.getStatusImpactView(...args); }
function renderStatusImpactCell(...args) { return appEventsService.renderStatusImpactCell(...args); }
function getStatusImpactRoleDescription(...args) { return appEventsService.getStatusImpactRoleDescription(...args); }
function getStatusImpactParts(...args) { return appEventsService.getStatusImpactParts(...args); }
function renderDirectoryDetail(...args) { return appEventsService.renderDirectoryDetail(...args); }
function renderStatusImpactMap(...args) { return appEventsService.renderStatusImpactMap(...args); }
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
function getModuleMenuButtonFromEventTarget(...args) { return appEventsService.getModuleMenuButtonFromEventTarget(...args); }
function openModuleFromMenuButton(...args) { return appEventsService.openModuleFromMenuButton(...args); }
function bindRoutesEvents(...args) { return appEventsService.bindRoutesEvents(...args); } function bindNomenclatureEvents(...args) { return appEventsService.bindNomenclatureEvents(...args); } function bindBomListsEvents(...args) { return appEventsService.bindBomListsEvents(...args); }
function bindPlanningEvents(...args) { return appEventsService.bindPlanningEvents(...args); }
function bindShiftCalendarEvents(...args) { return appEventsService.bindShiftCalendarEvents(...args); }
function applyOperationMapChangesToRoutes(...args) { return appEventsService.applyOperationMapChangesToRoutes(...args); }
function deleteOperationMapItem(...args) { return appEventsService.deleteOperationMapItem(...args); }
function openProjectInPlanning(...args) { return appEventsService.openProjectInPlanning(...args); }
function bindDirectoryEvents(...args) { return appEventsService.bindDirectoryEvents(...args); }
function bindDirectoryForm(...args) { return appEventsService.bindDirectoryForm(...args); }
function saveDirectoryRow(...args) { return appEventsService.saveDirectoryRow(...args); }
function deleteDirectoryRow(...args) { return appEventsService.deleteDirectoryRow(...args); }
function deleteDirectoryStateRow(...args) { return appEventsService.deleteDirectoryStateRow(...args); }
function rememberScroll(...args) { return appEventsService.rememberScroll(...args); }
function restoreScroll(...args) { return appEventsService.restoreScroll(...args); }
function updateDependencyClip(...args) { return appEventsService.updateDependencyClip(...args); }
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
  buildDefaultSpecificationStructureItems,
  calculateProjectProgress,
  cancelPlanningRoute,
  canEditDirectorySection,
  cascadeBatchFromSlot,
  changePlanningRouteQuantity,
  chartColors,
  createAppInteractionsModule,
  bindAuthPrototypeEvents: (...args) => bindAuthPrototypeEvents(...args),
  bindAuthSessionEvents: (...args) => bindAuthSessionEvents(...args),
  createProductsEventsModule,
  createSpekiSpecification,
  createRoutesEventsModule,
  cancelAuthPrototypePinFeedback,
  completeAuthPrototypeLogin,
  deleteRouteMapConfirmed,
  closeModals: (...args) => closeModals(...args),
  doesAuthSessionFactNeedDeviationComment: (...args) => doesAuthSessionFactNeedDeviationComment(...args),
  directorySections,
  ensurePlanningRuntimeProjection: () => hydratePlanningRuntimeProjection(),
  ensurePlanningSystemDomains,
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
  getBomList: (...args) => typeof getBomList === "function" ? getBomList(...args) : null,
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
  getWarningProductionId,
  getWarningPlanningOrderId,
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
    closeModals();
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
