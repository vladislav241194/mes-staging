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

export const UI_HARDENING_PLAN_STAGES = [
  {
    order: 1,
    id: "ui-inventory",
    title: "UI-инвентаризация",
    status: "closed",
    requiredEvidence: ["component-registry", "runtime-coverage-registry", "runtime-class-audit"],
  },
  {
    order: 2,
    id: "ui-contract-registry",
    title: "UI Contract Registry",
    status: "closed",
    requiredEvidence: ["component-contracts", "style-token-contracts", "dom-normalizer-contracts"],
  },
  {
    order: 3,
    id: "action-button-contract",
    title: "ActionButton contract",
    status: "closed",
    requiredEvidence: ["action-button-helper", "action-button-css", "action-button-smoke-gate"],
  },
  {
    order: 4,
    id: "sidebar-header-contract",
    title: "Sidebar/Header contract",
    status: "closed",
    requiredEvidence: ["sidebar-helper", "module-header-helper", "sidebar-width-smoke-gate", "module-background-smoke-gate"],
  },
  {
    order: 5,
    id: "panel-spacing-contract",
    title: "Panel/Spacing contract",
    status: "closed",
    requiredEvidence: ["panel-helper", "panel-body-helper", "panel-padding-tokens", "panel-overlap-smoke-gate"],
  },
  {
    order: 6,
    id: "table-contract",
    title: "Table contract",
    status: "closed",
    requiredEvidence: ["table-helper", "table-horizontal-scroll-contract", "table-vertical-scroll-smoke-gate"],
  },
  {
    order: 7,
    id: "form-field-contract",
    title: "FormField contract",
    status: "closed",
    requiredEvidence: ["form-field-helper", "form-control-height-token", "form-field-smoke-gate"],
  },
  {
    order: 8,
    id: "overlay-contract",
    title: "Modal/Drawer/Dropdown contract",
    status: "closed",
    requiredEvidence: ["modal-helper", "drawer-helper", "dropdown-helper", "opened-overlay-smoke-gates"],
  },
  {
    order: 9,
    id: "key-module-migration",
    title: "Миграция ключевых модулей",
    status: "closed",
    requiredEvidence: ["key-modules-hard-runtime", "no-partial-runtime-modules", "no-legacy-runtime-modules"],
  },
  {
    order: 10,
    id: "qa-gates",
    title: "QA-gates",
    status: "closed",
    requiredEvidence: ["qa-ui-script", "qa-syntax-script", "module-smoke-script", "css-layer-audit-script"],
  },
  {
    order: 11,
    id: "verification",
    title: "Проверка",
    status: "closed",
    requiredEvidence: ["qa-stabilize-script", "build-script", "git-diff-check-script"],
  },
];

export const UI_RUNTIME_COMPONENT_CONTRACTS = [
  {
    component: "AppShell",
    helperNames: ["renderUiAppShell"],
    cssSelectors: ["main.app-shell[data-layout=\"app-shell\"]"],
    purpose: "Главная оболочка приложения, меню, topbar и слой модалок.",
  },
  {
    component: "ModulePage",
    helperNames: ["renderUiModulePage"],
    cssSelectors: [".ui-module-page"],
    purpose: "Единая страница модуля: sidebar + workspace или полноширинная рабочая область.",
  },
  {
    component: "ModuleSidebar",
    helperNames: ["renderUiModuleSidebar"],
    cssSelectors: [".ui-module-sidebar", ".module-data-sidebar"],
    purpose: "Внутренний сайдбар модуля с одинаковой шириной, отступами и списками.",
  },
  {
    component: "ModuleWorkspace",
    helperNames: ["renderUiModulePage"],
    cssSelectors: [".ui-module-workspace", ".module-data-workspace"],
    purpose: "Рабочая область модуля; не должна создавать случайные вложенные scroll-слои.",
  },
  {
    component: "ModuleContent",
    helperNames: ["renderUiModulePage"],
    cssSelectors: [".ui-module-content", ".module-data-content"],
    purpose: "Вертикальный поток блоков внутри рабочей области.",
  },
  {
    component: "ModuleHeader",
    helperNames: ["renderUiModuleHeader"],
    cssSelectors: [".ui-module-header", ".directory-header"],
    purpose: "Заголовок рабочей области с аннотацией и actions.",
  },
  {
    component: "Panel",
    helperNames: ["renderUiPanel"],
    cssSelectors: [".ui-panel", ".module-panel"],
    purpose: "Основной блок интерфейса с управляемыми отступами и заголовком.",
  },
  {
    component: "PanelHead",
    helperNames: ["renderUiPanelHead"],
    cssSelectors: [".ui-panel-head"],
    purpose: "Заголовок панели; отвечает за inset, переносы и правый action-slot.",
  },
  {
    component: "PanelBody",
    helperNames: ["renderUiPanelBody"],
    cssSelectors: [".ui-panel-body"],
    purpose: "Тело панели; основной контролируемый источник внутренних отступов.",
  },
  {
    component: "PanelFooter",
    helperNames: ["renderUiPanelFooter"],
    cssSelectors: [".ui-panel-footer"],
    purpose: "Нижняя action-зона панели или модалки.",
  },
  {
    component: "ActionButton",
    helperNames: ["renderUiActionButton"],
    cssSelectors: [".ui-action-button", ".primary-button", ".secondary-button", ".icon-button", ".table-icon-button"],
    purpose: "Все кликабельные кнопки, включая иконки и table actions.",
  },
  {
    component: "ActionBar",
    helperNames: ["renderUiActionBar"],
    cssSelectors: [".ui-action-bar"],
    purpose: "Группа действий с единым gap и переносом.",
  },
  {
    component: "SidebarItem",
    helperNames: ["renderUiSidebarItem"],
    cssSelectors: [".ui-sidebar-item"],
    purpose: "Строка или карточка списка внутри сайдбара.",
  },
  {
    component: "TableWrap",
    helperNames: ["renderUiTableWrap"],
    cssSelectors: [".ui-table-wrap", "[data-layout=\"table\"]"],
    purpose: "Обертка таблицы с локальным горизонтальным scroll и запретом внутреннего vertical scroll.",
  },
  {
    component: "FormField",
    helperNames: ["renderUiFormField"],
    cssSelectors: [".ui-form-field", ".form-field"],
    purpose: "Единая высота, подпись и inset для input/select/textarea.",
  },
  {
    component: "Dropdown",
    helperNames: ["renderUiDropdownFrame"],
    cssSelectors: [".ui-dropdown", ".dense-inline-select", ".directory-column-filter"],
    purpose: "Выпадающий список с viewport-safe меню.",
  },
  {
    component: "Modal",
    helperNames: ["renderUiModalFrame", "renderUiModalShell"],
    cssSelectors: [".ui-modal", ".modal"],
    purpose: "Модальное окно с управляемой шириной, высотой и внутренним scroll.",
  },
  {
    component: "Drawer",
    helperNames: ["renderUiDrawerFrame", "renderUiDrawerShell"],
    cssSelectors: [".ui-drawer", ".detail-drawer", ".slot-drawer"],
    purpose: "Выдвижная карточка/панель деталей.",
  },
  {
    component: "GanttBar",
    helperNames: ["renderUiGanttBar"],
    cssSelectors: [".ui-gantt-bar", ".operation-slot"],
    purpose: "Демо/контрактная колбаска план/распределено/факт.",
  },
  {
    component: "StatusToken",
    helperNames: ["renderUiStatusToken"],
    cssSelectors: [".ui-status-token", ".mes-signal"],
    purpose: "Статус, риск, предупреждение, demo/calculation token.",
  },
  {
    component: "DemoBadge",
    helperNames: ["renderUiDemoBadge"],
    cssSelectors: [".ui-demo-badge"],
    purpose: "Плашка демо-функции, которая не влияет на систему.",
  },
  {
    component: "DemoMarker",
    helperNames: ["renderUiDemoCornerMarker", "renderUiDemoInteractiveMarker", "renderUiDemoInlineMarker"],
    cssSelectors: [".ui-demo-corner-marker", ".ui-demo-inline-marker"],
    purpose: "Малый D-маркер для UI-заглушек и демо-элементов.",
  },
  {
    component: "EmptyState",
    helperNames: ["renderUiEmptyState"],
    cssSelectors: [".ui-empty-state", ".module-preview-empty"],
    purpose: "Пустое состояние без самодельных карточек.",
  },
];

export const UI_RUNTIME_STYLE_TOKENS = [
  "--mes-ui-bg",
  "--mes-ui-bg-grid",
  "--mes-ui-bg-gradient",
  "--mes-ui-module-page-background",
  "--mes-ui-module-page-background-size",
  "--mes-ui-module-page-background-repeat",
  "--mes-ui-surface",
  "--mes-ui-surface-soft",
  "--mes-ui-surface-raised",
  "--mes-ui-line",
  "--mes-ui-line-strong",
  "--mes-ui-text",
  "--mes-ui-muted",
  "--mes-ui-primary",
  "--mes-ui-sidebar-bg",
  "--mes-ui-module-sidebar-width",
  "--mes-ui-work-sidebar-width",
  "--mes-ui-density-page",
  "--mes-ui-density-gap",
  "--mes-ui-panel-gap",
  "--mes-ui-panel-head-padding",
  "--mes-ui-panel-body-padding",
  "--mes-ui-panel-footer-padding",
  "--mes-ui-control-height",
  "--mes-ui-icon-button-size",
  "--mes-ui-table-icon-button-size",
  "--mes-ui-form-control-height",
  "--mes-ui-table-row-height",
  "--mes-ui-radius-xs",
  "--mes-ui-radius-sm",
  "--mes-ui-radius-md",
  "--mes-ui-radius-lg",
  "--mes-ui-radius-xl",
  "--mes-ui-pill",
  "--mes-ui-type-caption",
  "--mes-ui-type-body",
  "--mes-ui-type-section-title",
  "--mes-ui-line-caption",
  "--mes-ui-line-body",
  "--mes-ui-line-section-title",
  "--mes-ui-weight-regular",
  "--mes-ui-weight-semibold",
  "--mes-ui-weight-bold",
  "--mes-ui-shadow-sm",
  "--mes-ui-shadow-md",
];

export const UI_RUNTIME_DOM_NORMALIZER_CONTRACTS = [
  { component: "FormField", selector: "label:has(input), label:has(select), label:has(textarea), .form-field, .ui-form-field" },
  { component: "ActionButton", selector: "button, :is(label).primary-button, :is(label).secondary-button, .ui-action-button" },
  { component: "TableWrap", selector: "[data-layout='table'], .ui-table-wrap" },
  { component: "ModulePage", selector: ".module-data-page, .ui-module-page" },
  { component: "ModuleSidebar", selector: ".module-data-sidebar, .ui-module-sidebar" },
  { component: "ModuleWorkspace", selector: ".module-data-workspace, .ui-module-workspace" },
  { component: "ModuleContent", selector: ".module-data-content, .ui-module-content" },
  { component: "Panel", selector: ".module-panel, .ui-panel" },
  { component: "PanelHead", selector: ".modal-header, .drawer-header, .ui-panel-head" },
  { component: "PanelFooter", selector: ".modal-footer, .drawer-actions, .ui-panel-footer" },
  { component: "EmptyState", selector: ".module-preview-empty, .ui-empty-state" },
  { component: "StatusToken", selector: ".mes-signal, .ui-status-token" },
  { component: "DemoBadge", selector: ".ui-demo-badge" },
  { component: "Modal", selector: ".modal, .ui-modal" },
  { component: "Drawer", selector: ".slot-drawer, .detail-drawer, .ui-drawer" },
  { component: "Dropdown", selector: ".dense-inline-select, .directory-column-filter, .mobile-module-switcher, .ui-dropdown" },
  { component: "GanttBar", selector: ".operation-slot, .ui-gantt-bar" },
];

export const UI_RUNTIME_TABLE_SCROLL_SELECTORS = [
  "[data-layout='table'], .ui-table-wrap",
];

export const UI_RUNTIME_QA_CLASS_CONTRACTS = [
  { requiredClass: "form-field", companionClass: "ui-form-field", label: "form-field должен идти вместе с ui-form-field" },
  { requiredClass: "directory-table-wrap", companionClass: "ui-table-wrap", label: "directory-table-wrap должен идти вместе с ui-table-wrap" },
  { requiredClass: "speki-structure-table-wrap", companionClass: "ui-table-wrap", label: "speki-structure-table-wrap должен идти вместе с ui-table-wrap" },
  { requiredClass: "primary-button", companionClass: "ui-action-button", label: "primary-button должен идти вместе с ui-action-button" },
  { requiredClass: "secondary-button", companionClass: "ui-action-button", label: "secondary-button должен идти вместе с ui-action-button" },
  { requiredClass: "icon-button", companionClass: "ui-action-button", label: "icon-button должен идти вместе с ui-action-button" },
  { requiredClass: "table-icon-button", companionClass: "ui-action-button", label: "table-icon-button должен идти вместе с ui-action-button" },
];

export const UI_RUNTIME_CONTROLLED_CLASS_PREFIXES = [
  "auth-prototype-",
  "auth-session-",
  "shift-master-board-",
  "shift-work-orders-",
  "timesheet-",
  "roles-",
  "production-structure-",
  "planning-table-",
  "matrix-",
  "planning-order-",
  "route-",
  "routes-",
  "speki-",
  "bom-",
  "nomenclature-",
  "employee-",
  "employees-",
  "directory-",
  "dispatch-",
  "supply-",
  "shop-",
  "shop-map-",
  "product-",
  "products-",
  "spec-",
  "specification-",
  "calculator-",
  "operation-",
  "slot-",
  "planning-",
  "module-",
  "auth-",
  "access-",
  "smt-",
  "visual-",
  "row-",
  "bar-",
  "modal-",
  "app-",
];

export const UI_RUNTIME_DYNAMIC_CSS_ONLY_PREFIXES = [
  "is-",
  "status-",
  "dense-select-",
];

export const UI_RUNTIME_DYNAMIC_CSS_ONLY_CLASSES = [
  "production-row",
  "resource-row",
  "workCenter-row",
];

export function getUiRuntimeCoverageStatus(moduleId = "") {
  const id = String(moduleId || "").trim();
  if (HARD_UI_RUNTIME_MODULE_IDS.includes(id)) return "hard";
  if (SPECIAL_UI_RUNTIME_MODULE_IDS.includes(id)) return "special";
  if (PARTIAL_UI_RUNTIME_MODULE_IDS.includes(id)) return "partial";
  if (LEGACY_UI_RUNTIME_MODULE_IDS.includes(id)) return "legacy";
  return "unknown";
}

export function getUiRuntimeComponentContract(componentName = "") {
  const name = String(componentName || "").trim();
  return UI_RUNTIME_COMPONENT_CONTRACTS.find((contract) => contract.component === name) || null;
}
