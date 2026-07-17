import { renderDispatchModulePage } from "../src/modules/dispatch/render.js";
import { createAccessRolesModule } from "../src/modules/access_roles/render.js";
import { createProductionStructureMatrixModule } from "../src/modules/production_structure_matrix/render.js";
import { createWeeklyProductionControlModule } from "../src/modules/weekly_production_control/render.js";
import { createUiRenderers } from "../src/ui/components.js";
import { createMesModulePatternRenderer } from "../src/ui/module_patterns.js";
import { getMesModuleBlueprintDefinition } from "../src/module_registry.js";
import {
  escapeAttribute,
  escapeHtml,
  joinUiClasses,
} from "../src/ui/html.js";

const icon = (name) => `<svg data-smoke-icon="${escapeAttribute(name)}"></svg>`;
const renderers = createUiRenderers({ icon });
const renderMesModulePatternPage = createMesModulePatternRenderer({
  getBlueprint: getMesModuleBlueprintDefinition,
  renderUiModuleHeader: renderers.renderUiModuleHeader,
  renderUiModulePage: renderers.renderUiModulePage,
  renderUiModuleSidebar: renderers.renderUiModuleSidebar,
});
const failures = [];

const dispatchHtml = renderDispatchModulePage({
  renderMesModulePatternPage,
  renderUiPanel: renderers.renderUiPanel,
  renderUiPanelBody: renderers.renderUiPanelBody,
  renderUiSystemState: renderers.renderUiSystemState,
});

check("dispatch module", dispatchHtml, [
  "data-ui-component=\"ModulePage\"",
  "data-ui-runtime=\"hard-v1\"",
  "dispatch-placeholder-page",
  "data-ui-component=\"Panel\"",
  "data-ui-component=\"SystemState\"",
  "Диспетчерская временно отключена",
]);

const weekly = createWeeklyProductionControlModule({
  DAY_MS: 24 * 60 * 60 * 1000,
  addMs: (date, ms) => new Date(new Date(date).getTime() + ms),
  escapeAttribute,
  escapeHtml,
  formatDate: (date) => new Date(date).toLocaleDateString("ru-RU"),
  formatDateTimeShort: () => "01.07, 10:00",
  formatShiftWorkOrderPersonName: (value) => String(value || ""),
  formatShortDate: (date) => new Date(date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
  getApp: () => ({ querySelectorAll: () => [] }),
  getAuthSessionFactEntriesForGanttSlot: () => [],
  getGanttLinkedRecordEntries: () => [],
  getPlanningState: () => ({ shiftMasterAssignments: {} }),
  getPlanningTableSlotRows: () => [],
  getProductionStructureMatrixRuntimeOverrides: () => ({}),
  getProductionStructureResources: () => [],
  getProductionStructureWorkCenters: () => [],
  getShiftMasterAssignmentsForGanttSlot: () => [],
  getShiftMasterBoardFactEntriesForGanttSlot: () => [],
  getShiftWorkOrderIssueReports: () => [],
  getUi: () => ({ weeklyProductionControlWeekAnchor: "2026-07-01" }),
  getWeekNumber: () => 27,
  isGanttFactRecordReported: () => true,
  mapLegacyWorkCenterId: (value) => value,
  normalizeLookupText: (value) => String(value || "").trim().toLowerCase(),
  normalizePlainRecord: (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {}),
  normalizeShiftMasterBoardQuantity: (value) => Number(value || 0) || 0,
  normalizeShiftMasterFactQuantity: (value) => Number(value || 0) || 0,
  renderPlanningTableInlineEmpty: () => "<p>empty</p>",
  renderMesModulePatternPage,
  ...renderers,
  startOfDay: (date) => new Date(new Date(date).setHours(0, 0, 0, 0)),
  startOfWeek: () => new Date("2026-07-06T00:00:00"),
  toDate: (value) => new Date(value),
  toDateInput: (value) => new Date(value).toISOString().slice(0, 10),
});

check("weekly production control module", weekly.renderWeeklyProductionControlPage(), [
  "weekly-production-control-page",
  "Контроль недели",
  "Нет данных недели",
]);

const productionStructure = createProductionStructureMatrixModule({
  PRODUCTION_STRUCTURE_MATRIX_COLUMNS: ["Структура", "Тип строки", "ID / код"],
  PRODUCTION_STRUCTURE_MATRIX_FIELD_OPTIONS: {},
  PRODUCTION_STRUCTURE_MATRIX_ROWS: [{
    id: "row-1",
    level: 0,
    cells: {
      "Структура": "Отдел теста",
      "Тип строки": "Отдел",
      "ID / код": "D-TEST",
    },
  }],
  SHIFT_MASTER_ASSIGNMENT_SCOPE_MODES: [{ id: "department", shortLabel: "ветка", label: "Ветка", description: "Ветка" }],
  escapeAttribute,
  escapeHtml,
  getApp: () => ({ querySelector: () => null }),
  getShiftMasterAssignableEmployees: () => [],
  getShiftMasterAssignmentConfig: () => ({ mode: "department", employeeIds: [] }),
  getShiftMasterDefaultEmployeeScope: () => [],
  getShiftMasterEmployeeRows: () => [],
  getShiftMasterNormalizedWorkCenterId: (value) => value,
  getShiftMasterProfile: () => null,
  getShiftMasterProfiles: () => [],
  getShiftMasterWorkCenterCatalog: () => [],
  getUi: () => ({ productionStructureMatrixOverrides: {} }),
  getWorkCenter: () => null,
  joinUiClasses,
  normalizePlainRecord: (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {}),
  normalizeShiftMasterAssignmentScopeMode: (value) => value || "department",
  notifySaveSuccess: () => {},
  persistUiState: () => {},
  render: () => {},
  ...renderers,
  resetShiftMasterAssignmentMatrixConfig: () => {},
  selected: (left, right) => (left === right ? "selected" : ""),
  setShiftMasterAssignmentMatrixConfig: () => {},
  setShiftMasterAssignmentMatrixEmployee: () => {},
  sortShiftMasterAssignableEmployees: (employees) => employees,
  syncProductionStructureMatrixToPlanningState: () => {},
});

check("production structure matrix module", productionStructure.renderProductionStructureMatrixPage(), [
  "production-structure-page",
  "Структура и сотрудники",
  "Подразделения",
  "реестр пуст",
]);

const accessRoles = createAccessRolesModule({
  ACCESS_ROLE_ACTIONS: [
    { id: "view", label: "Просмотр", shortLabel: "Видит" },
    { id: "edit", label: "Редактирование", shortLabel: "Правит" },
  ],
  ACCESS_ROLE_SCOPES: [{ id: "factory", label: "Вся система" }],
  escapeAttribute,
  escapeHtml,
  getAccessRoleForEmployee: () => ({ role: { label: "Администратор" }, explicit: false }),
  getAccessRoleProfiles: () => [{
    id: "admin",
    label: "Администратор",
    caption: "полный доступ",
    scope: "factory",
    defaultModule: "gantt",
    modulePermissions: {
      gantt: { view: true, edit: true },
      roles: { view: true, edit: true },
    },
  }],
  getApp: () => ({ querySelector: () => null }),
  getMesModuleFlowContract: () => ({ group: "Система" }),
  getModuleAnnotation: (moduleId) => `module ${moduleId}`,
  getModuleDefinitions: () => [
    { id: "gantt", label: "Планирование" },
    { id: "roles", label: "Роли и доступ" },
  ],
  getProductionStructureEmployees: () => [{
    id: "employee-1",
    name: "Иванов Иван",
    role: "Мастер",
    department: "Отдел теста",
  }],
  getProductionStructureMatrixRuntimeOverrides: () => ({}),
  getUi: () => ({
    accessRoleAssignments: {},
    accessRolesSelectedRoleId: "admin",
    activeRole: "admin",
    authCurrentUserId: "employee-1",
  }),
  normalizeAccessPermissionRecord: (value = {}) => ({ view: Boolean(value.view), edit: Boolean(value.edit) }),
  normalizeAccessRoleAssignments: (value = {}) => value,
  normalizeInterfaceRoleId: (value = "") => value || "admin",
  renderMesModulePatternPage,
  ...renderers,
});

check("access roles module", accessRoles.renderAccessRolesPage(), [
  "access-roles-page",
  "Access control",
  "Grants роли",
  "Области ответственности",
  "Иванов Иван",
]);

if (failures.length) {
  console.error("[extracted-module-render-smoke] Failures:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("[extracted-module-render-smoke] OK");

function check(label, html, expectedParts) {
  if (!String(html || "").trim()) {
    failures.push(`${label}: empty output`);
  }
  if (html.includes("undefined")) {
    failures.push(`${label}: output contains undefined`);
  }
  if (html.includes("[object Object]")) {
    failures.push(`${label}: output contains [object Object]`);
  }
  for (const part of expectedParts) {
    if (!html.includes(part)) {
      failures.push(`${label}: missing ${part}`);
    }
  }
}
