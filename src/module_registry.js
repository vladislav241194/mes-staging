import {
  MES_MODULE_HEADER_MODES,
  MES_MODULE_LAYOUT_PATTERNS,
  MES_MODULE_NAVIGATION_SCOPES,
  MES_MODULE_RUNTIME_CONTRACTS,
  MES_MODULE_RUNTIME_KINDS,
  MES_MODULE_RUNTIME_LIFECYCLES,
  MES_MODULE_SIDEBAR_MODES,
  createMesModuleBlueprintRegistry,
  defineMesModuleBlueprint,
} from "./module_blueprint.js";
import { GENERATED_MODULE_BLUEPRINTS } from "./generated/module_blueprint_index.js";
import {
  getMesReactCompletionModuleDefinition,
  getMesReactCompletionModuleStatus,
} from "./react_completion_registry.js";

export { MES_MODULE_NAVIGATION_SCOPES } from "./module_blueprint.js";

export const MES_MODULE_NAVIGATION_GROUPS = Object.freeze([
  Object.freeze({ id: "loadPlanning", label: "Планирование нагрузки", order: 10 }),
  Object.freeze({ id: "operations", label: "Оперативное управление", order: 20 }),
  Object.freeze({ id: "technologies", label: "Технологии", order: 30 }),
  Object.freeze({ id: "system", label: "Система", order: 40 }),
]);

const COMMON_FULL_ACCESS = ["view", "edit", "print", "assign", "approve"];
const PLANNING_ACCESS = ["view", "edit", "print", "approve"];
const OPERATIONAL_ACCESS = ["view", "edit", "print", "assign"];
const TECHNOLOGY_ACCESS = ["view", "edit", "print"];
const READ_ONLY_ACCESS = ["view"];

function coreBlueprint({
  id,
  label,
  icon,
  groupId = null,
  navigationOrder,
  scope = MES_MODULE_NAVIGATION_SCOPES.USER,
  flowOrder,
  pattern,
  header,
  sidebar,
  shellClassName,
  pageClassName = "",
  sidebarClassName = "",
  workspaceClassName = "",
  contentClassName = "",
  ariaLabel = label,
  visualContract = "",
  contractMode = "standard",
  runtimeKind = MES_MODULE_RUNTIME_KINDS.STANDARD,
  runtimeContract = MES_MODULE_RUNTIME_CONTRACTS.HARD,
  instanceKey = "",
  lifecycle = MES_MODULE_RUNTIME_LIFECYCLES.STANDARD_READY,
  runtimeChrome = "standard",
  runtimeComponent = "ModulePage",
  runtimeProtection = "",
  runtimeContractLabel = "",
  visualWave,
  parity,
  regression,
  mobileLimitedReason = "",
  overlayProbeSelector = "",
  overlayProbeException = "",
  defaultRoleActions = {},
  nonAdminReachability = "",
  capabilities = {},
  sourceFiles,
  ownership = {},
}) {
  return defineMesModuleBlueprint({
    id,
    label,
    icon,
    navigation: { groupId, order: navigationOrder, scope },
    layout: {
      pattern,
      header,
      sidebar,
      shellClassName,
      pageClassName,
      sidebarClassName,
      workspaceClassName,
      contentClassName,
      ariaLabel,
      visualContract,
      contractMode,
    },
    runtime: {
      kind: runtimeKind,
      contract: runtimeContract,
      instanceKey: instanceKey || id,
      lifecycle,
      chrome: runtimeChrome,
      component: runtimeComponent,
      protection: runtimeProtection,
      contractLabel: runtimeContractLabel,
    },
    qa: {
      smoke: true,
      visualWave,
      parity,
      regression,
      mobileLimitedReason,
      overlayProbeSelector,
      overlayProbeException,
    },
    flow: { order: flowOrder },
    access: { defaultRoleActions, nonAdminReachability },
    capabilities,
    sourceFiles,
    ownership: { files: sourceFiles, ...ownership },
  });
}

const CORE_MODULE_BLUEPRINTS = [
  coreBlueprint({
    id: "gantt", label: "Планирование", icon: "gantt", groupId: "loadPlanning", navigationOrder: 10, flowOrder: 60,
    pattern: MES_MODULE_LAYOUT_PATTERNS.PROTECTED_CANVAS, header: MES_MODULE_HEADER_MODES.SPECIAL, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "planning-app-shell planning-gantt-shell", ariaLabel: "Диаграмма производственной нагрузки", contractMode: "special",
    runtimeKind: MES_MODULE_RUNTIME_KINDS.SPECIAL, runtimeContract: MES_MODULE_RUNTIME_CONTRACTS.GANTT,
    lifecycle: MES_MODULE_RUNTIME_LIFECYCLES.SPECIAL_RUNTIME,
    runtimeComponent: "GanttRuntime", runtimeProtection: "special-runtime-protected", runtimeContractLabel: "Gantt Phase 5 stabilization contract",
    visualWave: "protected",
    parity: { family: "gantt-protected", shell: "standard", page: "gantt", header: "special" },
    regression: { type: "special-runtime-protected", hasTable: false, hasActions: true, hasGantt: true, allowedInternalOverflowSelectors: [".gantt-react-scroll", ".gantt-react-grid"], requiredSelectors: ["[data-react-gantt-island]", ".gantt-react-scroll", ".gantt-react-canvas", "[data-ui-component='GanttSlot']"], futurePhase: "Exact geometry and deferred optimization/dependency/resize owners" },
    overlayProbeException: "Protected by the React Gantt production-model and runtime-policy suites.",
    mobileLimitedReason: "The React timeline remains data-dense; narrow smoke covers runtime availability, not final mobile UX.",
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, planner: PLANNING_ACCESS, technologist: READ_ONLY_ACCESS, master: READ_ONLY_ACCESS, dispatcher: READ_ONLY_ACCESS },
    capabilities: { actions: true, overlays: ["slot-detail", "dependency-inspector"], runtime: ["react-timeline", "postgres-projection", "slot-reschedule"] },
    sourceFiles: ["src/modules/gantt_runtime/react_island_host.js", "experiments/react-migration/src/modules/gantt/GanttScenario.tsx", "experiments/react-migration/src/modules/gantt/production-model.ts"],
  }),
  coreBlueprint({
    id: "planning", label: "Заказ-наряды", icon: "calendar", groupId: "loadPlanning", navigationOrder: 20, flowOrder: 50,
    pattern: MES_MODULE_LAYOUT_PATTERNS.DETAIL_WORKFLOW, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.REQUIRED,
    shellClassName: "planning-empty-app-shell planning-workbench-shell", pageClassName: "planning-order-page", ariaLabel: "Заказ-наряды",
    visualWave: "dense-planning", parity: { family: "sidebar-planning", shell: "standard", page: "sidebar", header: "required" },
    regression: { type: "contract", hasTable: true, hasActions: true, hasTree: true, requiredSelectors: [".planning-order-page"] },
    mobileLimitedReason: "Planning order labor table is data-dense; narrow smoke allows internal table scroll.",
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, planner: PLANNING_ACCESS, technologist: READ_ONLY_ACCESS, master: READ_ONLY_ACCESS, dispatcher: READ_ONLY_ACCESS },
    capabilities: { table: true, tree: true, actions: true }, sourceFiles: ["src/modules/planning_workbench/react_island_host.js"],
  }),
  coreBlueprint({
    id: "weeklyProductionControl", label: "Контроль недели", icon: "chart", groupId: "loadPlanning", navigationOrder: 30, flowOrder: 70,
    pattern: MES_MODULE_LAYOUT_PATTERNS.DASHBOARD, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "weekly-production-control-app-shell", pageClassName: "weekly-production-control-page", workspaceClassName: "weekly-production-control-workspace", contentClassName: "weekly-production-control-content", ariaLabel: "Недельный контроль плана и факта", visualContract: "ops-soft-v1",
    visualWave: "operational", parity: { family: "full-header", shell: "standard", page: "full", header: "required" },
    regression: { type: "contract", hasTable: true, hasActions: false },
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, planner: READ_ONLY_ACCESS, technologist: READ_ONLY_ACCESS, master: READ_ONLY_ACCESS, dispatcher: READ_ONLY_ACCESS },
    lifecycle: MES_MODULE_RUNTIME_LIFECYCLES.FACTORY_LAZY, capabilities: { table: true }, sourceFiles: ["src/modules/weekly_production_control/react_island_host.js", "src/modules/weekly_production_control/production_read_input.js"],
  }),
  coreBlueprint({
    id: "shiftMasterBoard", label: "Мастерская", icon: "worker", groupId: "operations", navigationOrder: 20, flowOrder: 80,
    pattern: MES_MODULE_LAYOUT_PATTERNS.BOARD, header: MES_MODULE_HEADER_MODES.SPECIAL, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "shift-master-board-app-shell", pageClassName: "shift-master-board-page", ariaLabel: "Мастерская", visualContract: "board-native-header",
    visualWave: "operational", parity: { family: "full-headerless", shell: "standard", page: "full", header: "special" },
    regression: { type: "contract", hasTable: false, hasActions: true, hasOverlayProbe: true },
    overlayProbeSelector: "[data-shift-board-print]:not([disabled])",
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, master: OPERATIONAL_ACCESS, dispatcher: READ_ONLY_ACCESS },
    capabilities: { actions: true, overlays: ["shift-sheet"] }, sourceFiles: ["src/modules/shift_master_board/render.js"],
  }),
  coreBlueprint({
    id: "authSessionPrototype", label: "Рабочий стол", icon: "keyboard", groupId: "operations", navigationOrder: 30, flowOrder: 170,
    pattern: MES_MODULE_LAYOUT_PATTERNS.DETAIL_WORKFLOW, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "auth-prototype-app-shell auth-session-prototype-app-shell", pageClassName: "auth-session-prototype-page", ariaLabel: "Рабочий стол исполнителя",
    visualWave: "operational", parity: { family: "full-header", shell: "standard", page: "full", header: "required", workspaceSurface: "detail-workflow" },
    regression: { type: "contract", hasTable: false, hasActions: false, hasOverlayProbe: false },
    overlayProbeException: "Auth session fact overlay is covered by auth and shift-flow functional suites.",
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, master: OPERATIONAL_ACCESS, executor: ["view", "edit"] },
    capabilities: { overlays: ["fact-entry"] }, sourceFiles: ["src/modules/auth_render/employee_desktop_react_island_host.js"],
  }),
  coreBlueprint({
    id: "marking", label: "Маркировка", icon: "unit-marking", groupId: "operations", navigationOrder: 35, flowOrder: 175,
    pattern: MES_MODULE_LAYOUT_PATTERNS.DETAIL_WORKFLOW, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "marking-app-shell", pageClassName: "marking-page", ariaLabel: "Рабочее место маркировки", visualContract: "ops-soft-v1",
    visualWave: "operational", parity: { family: "full-header", shell: "standard", page: "full", header: "required", workspaceSurface: "detail-workflow" },
    regression: { type: "contract", hasTable: true, hasActions: true, hasOverlayProbe: true },
    overlayProbeSelector: "[data-marking-code-search]",
    mobileLimitedReason: "Таблица кодов остаётся плотной; на узком экране используется внутренний горизонтальный scroll.",
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, master: OPERATIONAL_ACCESS, executor: ["view", "edit", "print"] },
    capabilities: { table: true, actions: true, overlays: ["code-search"] },
    sourceFiles: ["src/modules/marking/react_island_host.js"],
    ownership: { files: ["src/modules/marking/react_island_host.js", "experiments/react-migration/src/modules/marking/MarkingScenario.tsx"], css: ["styles/react-marking-island.css"], qa: ["scripts/marking-module-qa.mjs", "scripts/marking-module-functional-qa.mjs"] },
  }),
  coreBlueprint({
    id: "shiftWorkOrders", label: "Журнал СЗН", icon: "document", groupId: "operations", navigationOrder: 40, flowOrder: 90,
    pattern: MES_MODULE_LAYOUT_PATTERNS.TREE_EDITOR, header: MES_MODULE_HEADER_MODES.ABSENT, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "shift-work-orders-app-shell", pageClassName: "shift-work-orders-page", ariaLabel: "Журнал сменных заказ-нарядов", visualContract: "headerless-module",
    visualWave: "operational", parity: { family: "full-headerless", shell: "standard", page: "full", header: "absent" },
    regression: { type: "contract", hasTable: true, hasActions: true, hasTree: true, hasOverlayProbe: true },
    overlayProbeSelector: "[data-shift-work-order-print-preview]:not([disabled])",
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, planner: READ_ONLY_ACCESS, master: ["view", "print"], dispatcher: READ_ONLY_ACCESS },
    capabilities: { table: true, tree: true, actions: true, overlays: ["print-preview", "issue-photo"] }, sourceFiles: ["src/modules/shift_work_orders/render.js"],
  }),
  coreBlueprint({
    id: "specifications2", label: "Спецификации 2.0", icon: "upload", groupId: "technologies", navigationOrder: 10, flowOrder: 30,
    pattern: MES_MODULE_LAYOUT_PATTERNS.PROTECTED_CANVAS, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.REQUIRED,
    shellClassName: "specifications2-app-shell", pageClassName: "specifications2-page", ariaLabel: "Спецификации 2.0", contractMode: "protected",
    visualWave: "protected", parity: { family: "sidebar-standard", shell: "standard", page: "sidebar", header: "required", workspaceSurface: "protected-canvas" },
    regression: { type: "contract", hasTable: true, hasActions: true, hasTree: true },
    mobileLimitedReason: "XLSX specification preview is data-dense; narrow smoke verifies render and table contract only.",
    defaultRoleActions: { productionHead: READ_ONLY_ACCESS, technologist: TECHNOLOGY_ACCESS },
    capabilities: { table: true, tree: true, actions: true },
    sourceFiles: [
      "src/modules/specifications2/react_island_host.js",
      "src/modules/specifications2/production_owner.js",
    ],
  }),
  coreBlueprint({
    id: "nomenclature", label: "Номенклатура", icon: "package", groupId: "technologies", navigationOrder: 40, flowOrder: 10,
    pattern: MES_MODULE_LAYOUT_PATTERNS.REGISTRY_TABLE, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.REQUIRED,
    shellClassName: "nomenclature-app-shell", pageClassName: "nomenclature-page", contentClassName: "nomenclature-module-content", ariaLabel: "Номенклатура",
    visualWave: "reference", parity: { family: "sidebar-standard", shell: "standard", page: "sidebar", header: "required" },
    regression: { type: "contract", hasTable: true, hasActions: true },
    defaultRoleActions: { productionHead: READ_ONLY_ACCESS, technologist: TECHNOLOGY_ACCESS },
    capabilities: { table: true, actions: true }, sourceFiles: ["src/modules/nomenclature/react_island_host.js", "src/modules/nomenclature/boards_react_island_host.js"],
  }),
  coreBlueprint({
    id: "productionStructureMatrix", label: "Структура и сотрудники", icon: "directory", groupId: "system", navigationOrder: 10, flowOrder: 110,
    pattern: MES_MODULE_LAYOUT_PATTERNS.SIDEBAR_WORKSPACE, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.REQUIRED,
    shellClassName: "production-structure-app-shell", pageClassName: "production-structure-page", sidebarClassName: "production-structure-sidebar", workspaceClassName: "production-structure-workspace", contentClassName: "production-structure-content", ariaLabel: "Структура и сотрудники",
    visualWave: "reference", parity: { family: "sidebar-standard", shell: "standard", page: "sidebar", header: "required" },
    regression: { type: "special-runtime", hasTable: true, hasActions: true },
    mobileLimitedReason: "Structure registries keep the standard sidebar while dense registry tables use internal horizontal scroll.",
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, planner: READ_ONLY_ACCESS, technologist: READ_ONLY_ACCESS, master: READ_ONLY_ACCESS },
    capabilities: { table: true, actions: true }, sourceFiles: ["src/modules/production_structure_matrix/render.js"],
  }),
  coreBlueprint({
    id: "timesheet", label: "Табель", icon: "calendar", groupId: "system", navigationOrder: 20, flowOrder: 120,
    pattern: MES_MODULE_LAYOUT_PATTERNS.CALENDAR, header: MES_MODULE_HEADER_MODES.ABSENT, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "timesheet-app-shell", pageClassName: "timesheet-page", ariaLabel: "Табель", visualContract: "headerless-module",
    visualWave: "dense-planning", parity: { family: "full-headerless", shell: "standard", page: "full", header: "absent" },
    regression: { type: "special-runtime", hasTable: true, hasActions: true, hasOverlayProbe: true },
    overlayProbeSelector: "[data-timesheet-day-button]",
    mobileLimitedReason: "Timesheet is a dense calendar grid; narrow smoke allows internal table scroll.",
    defaultRoleActions: { productionHead: COMMON_FULL_ACCESS, planner: READ_ONLY_ACCESS, master: ["view", "edit"], dispatcher: READ_ONLY_ACCESS },
    capabilities: { table: true, actions: true, overlays: ["cell-editor"] }, sourceFiles: ["src/modules/timesheet/render.js"],
  }),
  coreBlueprint({
    id: "roles", label: "Роли и доступ", icon: "lock", groupId: "system", navigationOrder: 30, flowOrder: 130,
    pattern: MES_MODULE_LAYOUT_PATTERNS.SIDEBAR_WORKSPACE, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.REQUIRED,
    shellClassName: "access-roles-app-shell", pageClassName: "access-roles-page", sidebarClassName: "access-roles-sidebar", workspaceClassName: "access-roles-workspace", contentClassName: "access-roles-content", ariaLabel: "Роли и доступ",
    visualWave: "reference", parity: { family: "sidebar-standard", shell: "standard", page: "sidebar", header: "required" },
    regression: { type: "contract", hasTable: true, hasActions: true },
    defaultRoleActions: { productionHead: READ_ONLY_ACCESS }, capabilities: { table: true, actions: true }, sourceFiles: ["src/modules/access_roles/render.js"],
  }),
  coreBlueprint({
    id: "directories", label: "Справочники и нормативы", icon: "directory", groupId: "system", navigationOrder: 40, flowOrder: 150,
    pattern: MES_MODULE_LAYOUT_PATTERNS.REGISTRY_TABLE, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.REQUIRED,
    shellClassName: "directory-app-shell", pageClassName: "directory-page", ariaLabel: "Справочники и нормативы",
    visualWave: "reference", parity: { family: "sidebar-standard", shell: "standard", page: "sidebar", header: "required" },
    regression: { type: "contract", hasTable: true, hasActions: true },
    overlayProbeException: "Directory editor/reader overlays remain covered by directory interaction smoke until their generic probe is promoted.",
    defaultRoleActions: { productionHead: READ_ONLY_ACCESS, technologist: TECHNOLOGY_ACCESS },
    capabilities: { table: true, actions: true, overlays: ["editor", "reader"] }, sourceFiles: ["src/app.js", "src/modules/app_events/service.js"],
  }),
  coreBlueprint({
    id: "contourAdmin", label: "Контуры", icon: "settings", navigationOrder: 10, flowOrder: 140, scope: MES_MODULE_NAVIGATION_SCOPES.ADMIN_ONLY,
    pattern: MES_MODULE_LAYOUT_PATTERNS.DASHBOARD, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "contour-admin-app-shell", pageClassName: "contour-admin-page", ariaLabel: "Контуры", contractMode: "protected",
    visualWave: "protected", parity: { family: "admin-preview", shell: "standard", page: "full", header: "required", skipActionVariants: true },
    regression: { type: "protected-admin-contract", hasTable: true, hasActions: true },
    capabilities: { table: true, actions: true }, sourceFiles: ["src/modules/contour_admin/render.js"],
    ownership: { api: ["/api/contour-admin/action"], qa: ["scripts/security-route-qa.mjs"] },
  }),
  coreBlueprint({
    id: "authPrototype", label: "Авторизация", icon: "lock", navigationOrder: 10, flowOrder: 160, scope: MES_MODULE_NAVIGATION_SCOPES.STANDALONE,
    pattern: MES_MODULE_LAYOUT_PATTERNS.DETAIL_WORKFLOW, header: MES_MODULE_HEADER_MODES.REQUIRED, sidebar: MES_MODULE_SIDEBAR_MODES.ABSENT,
    shellClassName: "auth-prototype-app-shell", pageClassName: "auth-prototype-page", ariaLabel: "Авторизация", contractMode: "protected", runtimeChrome: "standalone",
    visualWave: "protected", parity: { family: "auth-standalone", shell: "auth-standalone", page: "full", header: "required", skipActionVariants: true, skipPanelPadding: true },
    regression: { type: "special-runtime", hasTable: false, hasActions: false, requiredSelectors: ["[data-visual-qa-target='auth-prototype-header']", ".auth-prototype-department-grid"] },
    capabilities: { actions: true }, sourceFiles: ["src/modules/auth_render/auth_picker_react_island_host.js"],
  }),
];

export const MES_MODULE_BLUEPRINT_REGISTRY = createMesModuleBlueprintRegistry([
  ...CORE_MODULE_BLUEPRINTS,
  ...GENERATED_MODULE_BLUEPRINTS,
].sort((left, right) => left.flow.order - right.flow.order));

const GROUP_ORDER_BY_ID = new Map(MES_MODULE_NAVIGATION_GROUPS.map((group) => [group.id, group.order]));
const SCOPE_ORDER = new Map([
  [MES_MODULE_NAVIGATION_SCOPES.USER, 0],
  [MES_MODULE_NAVIGATION_SCOPES.ADMIN_ONLY, 1],
  [MES_MODULE_NAVIGATION_SCOPES.STANDALONE, 2],
]);

export const MES_MODULE_NAVIGATION_REGISTRY = Object.freeze(MES_MODULE_BLUEPRINT_REGISTRY
  .map((blueprint) => {
    const completion = getMesReactCompletionModuleDefinition(blueprint.id);
    return Object.freeze({
      id: blueprint.id,
      label: blueprint.label,
      icon: blueprint.icon,
      groupId: blueprint.navigation.groupId,
      order: blueprint.navigation.order,
      scope: blueprint.navigation.scope,
      reactCompletionStatus: getMesReactCompletionModuleStatus(blueprint.id),
      reactVerificationStatus: completion?.verification || "deferred",
    });
  })
  .sort((left, right) => (
    (SCOPE_ORDER.get(left.scope) ?? 99) - (SCOPE_ORDER.get(right.scope) ?? 99)
    || (GROUP_ORDER_BY_ID.get(left.groupId) ?? 999) - (GROUP_ORDER_BY_ID.get(right.groupId) ?? 999)
    || left.order - right.order
    || left.id.localeCompare(right.id)
  )));

export function getMesModuleBlueprintDefinition(moduleId = "") {
  const id = String(moduleId || "").trim();
  return MES_MODULE_BLUEPRINT_REGISTRY.find((blueprint) => blueprint.id === id) || null;
}

export function getMesModuleBlueprintDefinitions(options = {}) {
  const adminHost = options.adminHost === true;
  const includeStandalone = options.includeStandalone !== false;
  const scopes = adminHost
    ? new Set([MES_MODULE_NAVIGATION_SCOPES.ADMIN_ONLY])
    : new Set([
      MES_MODULE_NAVIGATION_SCOPES.USER,
      ...(includeStandalone ? [MES_MODULE_NAVIGATION_SCOPES.STANDALONE] : []),
    ]);
  return MES_MODULE_BLUEPRINT_REGISTRY.filter((blueprint) => scopes.has(blueprint.navigation.scope));
}

export function getMesModuleNavigationDefinition(moduleId = "") {
  const id = String(moduleId || "").trim();
  return MES_MODULE_NAVIGATION_REGISTRY.find((moduleItem) => moduleItem.id === id) || null;
}

export function getMesModuleNavigationDefinitions(options = {}) {
  const blueprintIds = new Set(getMesModuleBlueprintDefinitions(options).map((blueprint) => blueprint.id));
  return MES_MODULE_NAVIGATION_REGISTRY.filter((moduleItem) => blueprintIds.has(moduleItem.id));
}

export function getMesModuleNavigationGroups(moduleDefinitions = []) {
  const definitions = Array.isArray(moduleDefinitions) ? moduleDefinitions : [];
  return MES_MODULE_NAVIGATION_GROUPS
    .map((group) => ({
      ...group,
      modules: definitions
        .filter((moduleItem) => moduleItem.scope === MES_MODULE_NAVIGATION_SCOPES.USER && moduleItem.groupId === group.id)
        .sort((left, right) => left.order - right.order),
    }))
    .filter((group) => group.modules.length);
}
