import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HARD_UI_RUNTIME_MODULE_IDS,
  PARTIAL_UI_RUNTIME_MODULE_IDS,
  SPECIAL_UI_RUNTIME_MODULE_IDS,
  UI_HARDENING_PLAN_STAGES,
  UI_RUNTIME_COMPONENT_CONTRACTS,
  UI_RUNTIME_DOM_NORMALIZER_CONTRACTS,
  UI_RUNTIME_QA_CLASS_CONTRACTS,
  UI_RUNTIME_STYLE_TOKENS,
  UI_RUNTIME_TABLE_SCROLL_SELECTORS,
} from "../src/ui_runtime_contracts.js";
import { getMesModuleNavigationDefinitions } from "../src/module_registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const paths = {
  app: path.join(rootDir, "src", "app.js"),
  index: path.join(rootDir, "index.html"),
  styles: path.join(rootDir, "styles.css"),
  uiCoreStyles: path.join(rootDir, "styles", "mes-ui-core.css"),
  build: path.join(rootDir, "scripts", "build.mjs"),
  localServerWrapper: path.join(rootDir, "scripts", "run-with-local-server.mjs"),
  designSnapshots: path.join(rootDir, "scripts", "design-qa-snapshots.mjs"),
  package: path.join(rootDir, "package.json"),
  speedDocs: path.join(rootDir, "docs", "mes-prototyping-speed-v1.md"),
  componentMapDocs: path.join(rootDir, "docs", "mes-component-map-v1.md"),
  hardRuntimeCoverageDocs: path.join(rootDir, "docs", "hard-ui-runtime-coverage-v2.md"),
  hardRuntimeLegacyRoadmapDocs: path.join(rootDir, "docs", "hard-ui-runtime-legacy-roadmap-v2.md"),
  bootstrapSnapshot: path.join(rootDir, "bootstrap-snapshot.json"),
  uiRuntimeContracts: path.join(rootDir, "src", "ui_runtime_contracts.js"),
  uiHtml: path.join(rootDir, "src", "ui", "html.js"),
  uiComponents: path.join(rootDir, "src", "ui", "components.js"),
  accessRolesModule: path.join(rootDir, "experiments", "react-migration", "src", "modules", "roles", "adapter.ts"),
  ganttRuntimeModule: path.join(rootDir, "experiments", "react-migration", "src", "modules", "gantt", "GanttScenario.tsx"),
  uiRuntimeCoverageContracts: path.join(rootDir, "src", "ui", "contracts", "runtime-contracts.js"),
  uiHardeningPlanContracts: path.join(rootDir, "src", "ui", "contracts", "hardening-plan-contracts.js"),
  uiRuntimeCoverageQa: path.join(rootDir, "scripts", "ui-runtime-coverage-qa.mjs"),
  uiHardeningPlanQa: path.join(rootDir, "scripts", "ui-hardening-plan-qa.mjs"),
};

async function collectCssFiles(relativeDir = "styles") {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectCssFiles(relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".css") && relativePath !== "styles/mes-ui-core.css") {
      files.push(relativePath);
    }
  }
  return files;
}

async function collectRuntimeJsSources(relativeDir = path.join("src", "modules")) {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  const chunks = [];
  for (const entry of entries) {
    const entryPath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      chunks.push(...await collectRuntimeJsSources(path.relative(rootDir, entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      chunks.push(await fs.readFile(entryPath, "utf8"));
    }
  }
  return chunks;
}

const styleLayerFiles = ["styles.css", ...await collectCssFiles()];
const browserQaScriptFiles = [
  "scripts/state-consistency-qa.mjs",
  "scripts/planning-labor-functional-qa.mjs",
  "scripts/boot-performance-qa.mjs",
  "scripts/timesheet-functional-qa.mjs",
  "scripts/module-smoke-qa.mjs",
  "scripts/gantt-operational-layer-qa.mjs",
  "scripts/shift-operational-flow-functional-qa.mjs",
  "scripts/auth-functional-qa.mjs",
  "scripts/design-qa-snapshots.mjs",
  "scripts/mobile-qa.mjs",
  "scripts/scroll-dropdown-qa.mjs",
];

const [appSource, indexSource, rawStylesSource, uiCoreStylesSource, buildSource, localServerWrapperSource, designSnapshotsSource, packageSource, speedDocsSource, componentMapDocsSource, hardRuntimeCoverageDocsSource, hardRuntimeLegacyRoadmapDocsSource, bootstrapSnapshotSource, uiRuntimeContractsSource, uiRuntimeCoverageQaSource, uiHardeningPlanQaSource, accessRolesModuleSource, ganttRuntimeModuleSource, moduleRuntimeSources] = await Promise.all([
  fs.readFile(paths.app, "utf8"),
  fs.readFile(paths.index, "utf8"),
  fs.readFile(paths.styles, "utf8"),
  fs.readFile(paths.uiCoreStyles, "utf8"),
  fs.readFile(paths.build, "utf8"),
  fs.readFile(paths.localServerWrapper, "utf8"),
  fs.readFile(paths.designSnapshots, "utf8"),
  fs.readFile(paths.package, "utf8"),
  fs.readFile(paths.speedDocs, "utf8").catch(() => ""),
  fs.readFile(paths.componentMapDocs, "utf8").catch(() => ""),
  fs.readFile(paths.hardRuntimeCoverageDocs, "utf8").catch(() => ""),
  fs.readFile(paths.hardRuntimeLegacyRoadmapDocs, "utf8").catch(() => ""),
  // The production bootstrap snapshot is an external compatibility artifact:
  // release staging verifies and injects it after the clean Git build. When a
  // local fixture is present, keep auditing it; a clean worktree must not need
  // an unmanaged copy merely to run the source contract gate.
  fs.readFile(paths.bootstrapSnapshot, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  }),
  fs.readFile(paths.uiRuntimeContracts, "utf8"),
  fs.readFile(paths.uiRuntimeCoverageQa, "utf8"),
  fs.readFile(paths.uiHardeningPlanQa, "utf8"),
  fs.readFile(paths.accessRolesModule, "utf8"),
  fs.readFile(paths.ganttRuntimeModule, "utf8"),
  collectRuntimeJsSources(),
]);
const stylesSource = [
  rawStylesSource,
  ...await Promise.all(styleLayerFiles.filter((file) => file !== "styles.css").map((file) => fs.readFile(path.join(rootDir, file), "utf8"))),
].join("\n");
const browserQaSources = await Promise.all(browserQaScriptFiles.map((file) => fs.readFile(path.join(rootDir, file), "utf8")));
const [uiHtmlSource, uiComponentsSource, uiRuntimeCoverageContractsSource, uiHardeningPlanContractsSource] = await Promise.all([
  fs.readFile(paths.uiHtml, "utf8"),
  fs.readFile(paths.uiComponents, "utf8"),
  fs.readFile(paths.uiRuntimeCoverageContracts, "utf8"),
  fs.readFile(paths.uiHardeningPlanContracts, "utf8"),
]);
const runtimeSource = [appSource, ...moduleRuntimeSources].join("\n");
const moduleRegistrySource = await fs.readFile(path.join(rootDir, "src", "module_registry.js"), "utf8");
const uiRuntimeJsSource = [runtimeSource, uiHtmlSource, uiComponentsSource].join("\n");
const ganttRuntimeSource = [runtimeSource, ganttRuntimeModuleSource].join("\n");
const uiRuntimeContractsAllSource = [uiRuntimeContractsSource, uiRuntimeCoverageContractsSource, uiHardeningPlanContractsSource].join("\n");
const uiAllCssSource = [stylesSource, uiCoreStylesSource].join("\n");

const failures = [];
const warnings = [];
const removedReportDebugModulePattern = /reports-page|report-sidebar|report-workspace|report-(?:app-shell|content|main|chart-grid|chart-card|table-card|insights|dashboard-workspace|header|kpi|kpi-grid)|debug-(?:action-menu|app-shell|check-list|chip-select|combobox|command-input|content|dense-row|drawer|drawer-backdrop|dropdown-menu|dropdown-panel|error-tip|index|inline-options|inline-select|menu-panel|metric-popover|mini-list|modal-grid|popover|popover-stage|segment-label|select-button|spec-grid|status-select|stepper-card|stepper-grid|steps|tree-select|usage-grid|validation|wizard-modal)|debug-page|debug-sidebar|debug-workspace|debug-card|debug-section|data-layout-page="(?:reports|debug)"|module=(?:reports|debug)|id:\s*["'](?:reports|debug)["']|activeModule\s*={2,3}\s*["'](?:reports|debug)["']/;
const removedDashboardLayoutPattern = /dashboard-app-shell|dashboard-page|dashboard-control-room|dashboard-header|dashboard-time|dashboard-grid|dashboard-status-grid|dashboard-workspace|data-layout-page="dashboard"|module=dashboard|id:\s*["']dashboard["']|activeModule\s*={2,3}\s*["']dashboard["']/;
const removedStandaloneShellPattern = /(?:project|specification)-app-shell/;
const removedProjectUiPattern = /project-(?:binding|list|card|row|panel|relation|route|main|name-line|meta|status|readiness|module-content|editor-panel)|projectBinding|projectList|director-project-|data-focus-project/;

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function findLines(source, regexp) {
  return source
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => regexp.test(line));
}

function checkNoMatches(label, source, regexp) {
  const matches = findLines(source, regexp);
  if (!matches.length) return;
  fail(`${label}: ${matches.map((item) => item.number).join(", ")}`);
}

function checkNoPattern(label, source, regexp) {
  if (!regexp.test(source)) return;
  fail(label);
}

function checkNoCssRule(label, source, predicate) {
  const rules = source.match(/[^{}]+\{[^{}]*\}/g) || [];
  const badRules = rules.filter((rule) => {
    const selector = rule.slice(0, rule.indexOf("{")).trim();
    const body = rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"));
    return predicate(selector, body);
  });
  if (!badRules.length) return;
  fail(`${label}: ${badRules.slice(0, 3).map((rule) => rule.slice(0, rule.indexOf("{")).trim().replace(/\s+/g, " ")).join(" | ")}`);
}

function checkIncludes(label, source, value) {
  if (!source.includes(value)) fail(label);
}

function checkMatchCount(label, source, regexp, expectedCount) {
  const matches = source.match(regexp) || [];
  if (matches.length !== expectedCount) fail(`${label}: expected ${expectedCount}, got ${matches.length}`);
}

function checkClassContract(label, source, requiredClass, companionClass) {
  const regexp = /class="([^"]+)"/g;
  const offenders = [];
  let match;
  while ((match = regexp.exec(source))) {
    const classes = match[1].split(/\s+/).filter(Boolean);
    if (classes.includes(requiredClass) && !classes.includes(companionClass)) {
      offenders.push(source.slice(0, match.index).split("\n").length);
    }
  }
  if (offenders.length) fail(`${label}: ${offenders.slice(0, 12).join(", ")}`);
}

const requiredUiHelpers = [
  "function renderUiPanelHead",
  "function renderUiPanel(",
  "function renderUiPanelBody",
  "function renderUiPanelFooter",
  "function renderUiEmptyState",
  "function renderUiStatusToken",
  "function renderUiDemoBadge",
  "function renderUiActionButton",
  "function renderUiActionBar",
  "function renderUiToolbar",
  "function renderUiFilterBar",
  "function renderUiFormSection",
  "function renderUiFormGrid",
  "function renderUiFormRow",
  "function renderUiFormActions",
  "function renderUiSidebarItem",
  "function renderUiModuleSidebar",
  "function renderUiModulePage",
  "function renderUiAppShell",
  "function renderUiModuleHeader",
  "function renderUiTableWrap",
  "function renderUiFormField",
  "function renderUiSystemState",
  "function renderUiDropdownFrame",
  "function renderUiModalFrame",
  "function renderUiModalShell",
  "function renderUiDrawerFrame",
  "function renderUiDrawerShell",
  "function renderUiGanttBar",
  "function normalizeUiTone",
  "function markUiComponent",
  "function applyUiRuntimeContracts",
];

requiredUiHelpers.forEach((helper) => checkIncludes(`Нет UI Core helper: ${helper}`, uiRuntimeJsSource, helper));

const requiredUiCss = [
  ".ui-panel",
  ".ui-panel-body",
  ".ui-panel-footer",
  ".ui-module-header",
  ".ui-module-page",
  ".ui-module-workspace",
  ".ui-module-content",
  ".ui-module-sidebar",
  ".ui-panel-head",
  ".ui-panel-head-copy",
  ".ui-action-bar",
  ".ui-toolbar",
  ".ui-filter-bar",
  ".ui-action-button",
  ".ui-form-field",
  ".ui-form-section",
  ".ui-form-grid",
  ".ui-form-row",
  ".ui-form-actions",
  ".ui-system-state",
  ".ui-sidebar-list",
  ".ui-sidebar-label",
  ".ui-sidebar-item",
  ".ui-table-wrap",
  ".ui-empty-state",
  ".ui-status-token",
  ".ui-demo-badge",
  ".ui-dropdown",
  ".ui-modal",
  ".ui-drawer",
  ".ui-gantt-bar",
];

requiredUiCss.forEach((selector) => checkIncludes(`Нет CSS-контракта ${selector}`, uiAllCssSource, selector));

const requiredUiComponentMarkers = [
  "data-ui-component=\"AppShell\"",
  "data-ui-component=\"Panel\"",
  "data-ui-component=\"PanelHead\"",
  "data-ui-component=\"PanelBody\"",
  "data-ui-component=\"PanelFooter\"",
  "data-ui-component=\"ModulePage\"",
  "data-ui-component=\"ModuleSidebar\"",
  "data-ui-component=\"ModuleWorkspace\"",
  "data-ui-component=\"ModuleContent\"",
  "data-ui-component=\"ModuleHeader\"",
  "data-ui-component=\"ActionButton\"",
  "data-ui-component=\"ActionBar\"",
  "data-ui-component=\"Toolbar\"",
  "data-ui-component=\"FilterBar\"",
  "data-ui-component=\"SidebarItem\"",
  "data-ui-component=\"TableWrap\"",
  "data-ui-component=\"FormField\"",
  "data-ui-component=\"FormSection\"",
  "data-ui-component=\"FormGrid\"",
  "data-ui-component=\"FormRow\"",
  "data-ui-component=\"FormActions\"",
  "data-ui-component=\"SystemState\"",
  "data-ui-component=\"Dropdown\"",
  "data-ui-component=\"Modal\"",
  "data-ui-component=\"Drawer\"",
  "data-ui-component=\"GanttBar\"",
  "data-ui-component=\"StatusToken\"",
  "data-ui-component=\"DemoBadge\"",
  "data-ui-component=\"DemoMarker\"",
];

requiredUiComponentMarkers.forEach((marker) => checkIncludes(`Нет UI runtime marker ${marker}`, uiRuntimeJsSource, marker));
UI_RUNTIME_COMPONENT_CONTRACTS.forEach((contract) => {
  checkIncludes(`Нет UI component contract ${contract.component} в ui_runtime_contracts`, uiRuntimeContractsAllSource, `component: "${contract.component}"`);
  (contract.helperNames || []).forEach((helperName) => {
    checkIncludes(`Контракт ${contract.component} ссылается на отсутствующий helper ${helperName}`, uiRuntimeJsSource, `function ${helperName}`);
  });
  (contract.cssSelectors || []).forEach((selector) => {
    if (!selector.startsWith(".")) return;
    checkIncludes(`Контракт ${contract.component} ссылается на отсутствующий CSS selector ${selector}`, uiAllCssSource, selector);
  });
});
UI_RUNTIME_STYLE_TOKENS.forEach((token) => {
  checkIncludes(`Нет UI control token ${token}`, uiCoreStylesSource, token);
});
if (UI_HARDENING_PLAN_STAGES.length !== 11) {
  fail(`UI_HARDENING_PLAN_STAGES должен фиксировать 11 пунктов исходного UI-плана, сейчас ${UI_HARDENING_PLAN_STAGES.length}`);
}
UI_HARDENING_PLAN_STAGES.forEach((stage, index) => {
  if (stage.order !== index + 1 || !stage.id || !stage.title || stage.status !== "closed" || !Array.isArray(stage.requiredEvidence) || stage.requiredEvidence.length < 3) {
    fail(`Некорректный этап UI_HARDENING_PLAN_STAGES: ${JSON.stringify(stage)}`);
  }
});
checkIncludes("Нет исполняемого QA для 11 пунктов UI-плана", uiHardeningPlanQaSource, "all 11 UI hardening plan stages have executable coverage");
checkIncludes("UI hardening plan QA должен печатать статус ЗАКРЫТО по каждому этапу", uiHardeningPlanQaSource, "ЗАКРЫТО");
checkIncludes("UI hardening plan QA не подключен к qa:ui", packageSource, "ui-hardening-plan-qa.mjs");
UI_RUNTIME_QA_CLASS_CONTRACTS.forEach(({ label, requiredClass, companionClass }) => {
  checkClassContract(label, appSource, requiredClass, companionClass);
});

checkNoMatches("Новые shell нельзя писать вручную как <main class=\"app-shell...\">; использовать renderUiAppShell", appSource, /<main\s+class="app-shell/);
checkNoMatches("Live modal нельзя писать вручную как <section class=\"modal...\">; использовать renderUiModalShell/renderUiModalFrame", appSource, /<section\s+class="(?:modal(?:\s|")|[^"]+\smodal(?:\s|"))/);
checkNoMatches("Live drawer нельзя писать вручную как <aside class=\"slot-drawer/detail-drawer...\">; использовать renderUiDrawerShell/renderUiDrawerFrame", appSource, /<aside\s+class="(?:(?:slot-drawer|detail-drawer)(?:\s|")|[^"]+\s(?:slot-drawer|detail-drawer)(?:\s|"))/);
checkNoMatches("Runtime module-panel без ui-panel должен иметь data-ui-component=\"Panel\"", appSource, /<section[^>]*class="[^"]*\bmodule-panel\b(?![^"]*\bui-panel\b)[^"]*"(?![^>]*data-ui-component="Panel")/);
checkNoMatches("Runtime table-wrap/ui-table-wrap должен иметь data-ui-component=\"TableWrap\"", appSource, /<div[^>]*class="[^"]*(?:\bui-table-wrap\b|\b(?:directory|speki-structure|visual|timesheet|bom-import)[^"]*table-wrap\b)[^"]*"(?![^>]*data-ui-component="TableWrap")/);
checkNoMatches("Runtime TableWrap должен явно фиксировать scroll contract", appSource, /<div(?=[^>]*data-ui-component="TableWrap")(?![^>]*data-scroll-contract="(?:horizontal-only|viewport)")[^>]*>/);
checkNoMatches("Внутренний сайдбар должен использовать module-data-sidebar", appSource, /<aside\s+class="directory-sidebar(?! module-data-sidebar)/);
checkIncludes("index.html не подключает физический UI Core CSS слой", indexSource, "./styles/mes-ui-core.css");
checkIncludes("build.mjs не копирует/версирует физический UI Core CSS слой", buildSource, "mes-ui-core.css");
checkIncludes("renderUiPanelHead должен держать текстовую часть в ui-panel-head-copy", uiRuntimeJsSource, "class=\"ui-panel-head-copy\"");
checkNoMatches("Runtime не должен возвращать старый report-card-head; использовать ui-panel-head", appSource, /report-card-head/);
checkIncludes("UI Core должен нормализовать вложенный текст заголовка панели", uiCoreStylesSource, ".ui-panel-head-copy > div");
checkIncludes("UI Core должен задавать form field contract", uiCoreStylesSource, ".ui-form-field > :is(input, select, textarea)");
checkIncludes("UI Core должен задавать viewport-safe dropdown menu", uiCoreStylesSource, "max-height: min(var(--mes-ui-dropdown-max-height), calc(100vh - var(--mes-ui-dropdown-viewport-gap)))");
checkIncludes("UI Core должен задавать GanttBar segment contract", uiCoreStylesSource, ".ui-gantt-bar-segment");
checkIncludes("Design snapshots не фиксируют раскрытую трудоемкость маршрутной карты", designSnapshotsSource, "routes-labor-open");
checkIncludes("Design snapshots не фиксируют открытую карточку операции Ганта", designSnapshotsSource, "gantt-slot-editor-open");
checkIncludes("Design snapshots не фиксируют открытый фильтр справочника", designSnapshotsSource, "directories-filter-open");
checkIncludes("Design snapshots не фиксируют печатную форму маршрутной карты", designSnapshotsSource, "routes-print-preview-open");
checkIncludes("Design snapshots не фиксируют модалку Табеля", designSnapshotsSource, "timesheet-editor-open");
checkIncludes("Design snapshots не фиксируют сменный лист Мастерской", designSnapshotsSource, "shift-master-sheet-open");
checkIncludes("Design snapshots не фиксируют экран выбора отдела авторизации", designSnapshotsSource, "authPrototype-departments");
checkIncludes("Design snapshots не фиксируют экран ввода PIN авторизации", designSnapshotsSource, "authPrototype-pin");
checkIncludes("Design snapshots авторизации должны удалять qa-auth-bypass", designSnapshotsSource, "targetUrl.searchParams.delete(\"qa-auth-bypass\")");
checkIncludes("Нет документа MES Prototyping Speed Pass v1", speedDocsSource, "MES Prototyping Speed Pass v1");
checkIncludes("Документ speed-pass не фиксирует шаблон нового модуля", speedDocsSource, "Шаблон нового модуля");
checkIncludes("Документ speed-pass не фиксирует QA gate", speedDocsSource, "QA gate");
checkIncludes("Нет документа MES Component Map v1", componentMapDocsSource, "MES Component Map v1");
checkIncludes("Component map не связывает shell с renderUiAppShell", componentMapDocsSource, "renderUiAppShell()");
checkIncludes("Component map не фиксирует бизнес-view-model слой", componentMapDocsSource, "Карта бизнес-view-model");
checkIncludes("Нет документа Hard UI Runtime Coverage Pass v2", hardRuntimeCoverageDocsSource, "Hard UI Runtime Coverage Pass v2");
checkIncludes("Документ Hard UI Runtime Coverage v2 не фиксирует partial=0", hardRuntimeCoverageDocsSource, "Partial-модули: нет");
checkIncludes("Нет документа Hard UI Runtime Legacy Roadmap v2", hardRuntimeLegacyRoadmapDocsSource, "Hard UI Runtime Legacy Roadmap v2");
checkIncludes("Legacy roadmap не фиксирует отдельный GanttRuntime", hardRuntimeLegacyRoadmapDocsSource, "GanttRuntime");
checkIncludes("Coverage doc не ссылается на legacy roadmap", hardRuntimeCoverageDocsSource, "hard-ui-runtime-legacy-roadmap-v2.md");
checkIncludes("renderUiTableWrap не задаёт horizontal-only как default scroll contract", uiRuntimeJsSource, "scrollContract = \"horizontal-only\"");
checkIncludes("renderUiTableWrap не маркирует динамический scroll contract", uiRuntimeJsSource, "data-scroll-contract=\"${escapeAttribute(normalizedScrollContract)}\"");
checkIncludes("UI Core не фиксирует horizontal-only scroll contract", uiCoreStylesSource, ".ui-table-wrap[data-scroll-contract=\"horizontal-only\"]");
checkIncludes("UI Core не фиксирует viewport scroll contract", uiCoreStylesSource, ".ui-table-wrap[data-scroll-contract=\"viewport\"]");
checkIncludes("UI Core table-wrap должен запрещать внутренний vertical scroll", uiCoreStylesSource, "overflow-y: hidden !important");
checkIncludes("Runtime не применяет UI contracts после каждого render()", appSource, "applyUiRuntimeContracts();");
checkIncludes("Нет hard UI runtime marker data-ui-runtime=\"hard-v1\"", uiRuntimeJsSource, "data-ui-runtime=\"hard-v1\"");
checkIncludes("Module Runtime должен поддерживать полноширинные страницы", uiRuntimeJsSource, "hasSidebar ? \"has-sidebar\" : \"is-full-width\"");
checkIncludes("UI Core не фиксирует полноширинный hard runtime layout", uiCoreStylesSource, ".ui-module-page.is-full-width");
checkIncludes("UI Core не фиксирует workspace hard runtime layout", uiCoreStylesSource, ".ui-module-workspace");
checkIncludes("UI Core не фиксирует hard-runtime ModuleContent как вертикальный поток", uiCoreStylesSource, "[data-ui-component=\"ModuleContent\"].ui-module-content");
checkIncludes("UI Core не фиксирует flex-column для hard-runtime ModuleContent", uiCoreStylesSource, "flex-direction: column !important");
checkIncludes("UI Core не фиксирует защиту hard-runtime Panel от схлопывания", uiCoreStylesSource, "[data-ui-component=\"Panel\"].ui-panel");
checkIncludes("UI Core не фиксирует hard-runtime PanelBody height:auto", uiCoreStylesSource, "[data-ui-component=\"Panel\"] > [data-ui-component=\"PanelBody\"]");
// Count emitted markers in the renderer source, not selector/query-string references
// in the application runtime. This keeps the ownership contract strict without
// making the QA gate depend on how a module finds its existing page in the DOM.
checkMatchCount("Hard runtime marker должен выпускаться только renderUiModulePage", uiComponentsSource, /data-ui-runtime="hard-v1"/g, 1);
checkMatchCount("ModulePage marker должен выпускаться только renderUiModulePage", uiComponentsSource, /data-ui-component="ModulePage"/g, 1);
checkIncludes("Runtime normalizer не подключает общий UI_RUNTIME_DOM_NORMALIZER_CONTRACTS", appSource, "UI_RUNTIME_DOM_NORMALIZER_CONTRACTS.forEach");
checkIncludes("Runtime normalizer не подключает общий UI_RUNTIME_TABLE_SCROLL_SELECTORS", appSource, "UI_RUNTIME_TABLE_SCROLL_SELECTORS.forEach");
UI_RUNTIME_DOM_NORMALIZER_CONTRACTS.forEach(({ component, selector }) => {
  checkIncludes(`Runtime normalizer component missing ${component}`, uiRuntimeContractsAllSource, `component: "${component}"`);
  checkIncludes(`Runtime normalizer selector missing ${component}: ${selector}`, uiRuntimeContractsAllSource, `selector: "${selector}"`);
});
UI_RUNTIME_TABLE_SCROLL_SELECTORS.forEach((selector) => {
  checkIncludes(`Runtime table scroll contract missing ${selector}`, uiRuntimeContractsAllSource, `"${selector}"`);
});
checkIncludes("module-smoke не содержит список hard-runtime модулей", browserQaSources.join("\n"), "HARD_UI_RUNTIME_MODULES");
checkIncludes("module-smoke не импортирует общий список hard-runtime модулей", browserQaSources.join("\n"), "HARD_UI_RUNTIME_MODULE_IDS");
checkIncludes("module-smoke не проверяет data-ui-runtime=hard-v1", browserQaSources.join("\n"), "expected data-ui-runtime=hard-v1");
checkIncludes("module-smoke не проверяет выход содержимого панели за границы", browserQaSources.join("\n"), "panel content escapes panel bounds");
checkIncludes("module-smoke не проверяет Panel без прямого PanelBody", browserQaSources.join("\n"), "hard Panel without direct PanelBody");
checkIncludes("module-smoke не проверяет panel marker coverage", browserQaSources.join("\n"), "visible panel without Panel marker");
checkIncludes("module-smoke не проверяет button marker coverage", browserQaSources.join("\n"), "visible button without UI component marker");
checkIncludes("module-smoke не проверяет form field marker coverage", browserQaSources.join("\n"), "visible form field without explicit FormField/DomainField contract");
checkIncludes("module-smoke не проверяет table marker coverage", browserQaSources.join("\n"), "visible table wrapper without TableWrap marker");
checkIncludes("module-smoke не проверяет вертикальный scroll внутри horizontal-only TableWrap", browserQaSources.join("\n"), "TableWrap horizontal-only has vertical scroll contract drift");
checkIncludes("module-smoke не проверяет наложение прямых блоков контента", browserQaSources.join("\n"), "module content direct blocks overlap");
checkIncludes("module-smoke не проверяет наложение прямых блоков внутри PanelBody", browserQaSources.join("\n"), "PanelBody direct blocks overlap");
checkIncludes("module-smoke не проверяет выпадение hard-runtime модулей из smoke-списка", browserQaSources.join("\n"), "Hard UI runtime modules are missing from module smoke QA");
checkIncludes("module-smoke не проверяет выпадение special-runtime модулей из smoke-списка", browserQaSources.join("\n"), "Special UI runtime modules are missing from module smoke QA");
checkIncludes("module-smoke не запрещает hard-v1 marker вне runtime coverage списка", browserQaSources.join("\n"), "page renders hard-v1 runtime but module is not listed in HARD/PARTIAL UI runtime coverage");
checkIncludes("module-smoke не запрещает special runtime marker вне special-runtime списка", browserQaSources.join("\n"), "page renders special runtime but module is not listed in SPECIAL_UI_RUNTIME_MODULE_IDS");
checkIncludes("module-smoke не применяет hard-runtime проверки к alias-страницам", browserQaSources.join("\n"), "await runModuleSpecificSmokeChecks(client, alias.target);");
checkIncludes("module-smoke не проверяет постоянный React GanttRuntime", browserQaSources.join("\n"), "permanent React island is missing");
checkIncludes("Живой Гант не маркирует GanttRuntime", ganttRuntimeSource, "data-ui-component=\"GanttRuntime\"");
checkIncludes("Живой Гант не маркирует GanttCanvas", ganttRuntimeSource, "data-ui-component=\"GanttCanvas\"");
checkIncludes("Живой Гант не маркирует GanttTimeline", ganttRuntimeSource, "data-ui-component=\"GanttTimeline\"");
checkIncludes("Живой Гант не маркирует GanttSlot", ganttRuntimeSource, "data-ui-component=\"GanttSlot\"");
checkIncludes("Живой React Гант не маркирует GanttRowsLayer", ganttRuntimeSource, "data-ui-component=\"GanttRowsLayer\"");
checkIncludes("Живой React Гант не публикует источник Planning projection", ganttRuntimeSource, "data-gantt-planning-projection-source={model.projectionSource}");
checkIncludes("Живой React Гант не содержит drop-lane", ganttRuntimeSource, "data-gantt-react-drop-lane");
checkIncludes("Живой React Гант не содержит форму серверного переноса", ganttRuntimeSource, "data-gantt-react-schedule-form");
checkIncludes("Живой React Гант не маркирует отложенные команды", ganttRuntimeSource, "data-gantt-react-blocked-action");
checkIncludes("module-smoke не запрещает возврат legacy shell Ганта", browserQaSources.join("\n"), "retired legacy shell returned");
checkIncludes("module-smoke не проверяет React GanttRuntime", browserQaSources.join("\n"), "React GanttRuntime is missing");
checkIncludes("module-smoke не проверяет React GanttCanvas", browserQaSources.join("\n"), "React GanttCanvas contract is missing");
checkIncludes("module-smoke не проверяет React GanttTimeline", browserQaSources.join("\n"), "React GanttTimeline contract is missing");
checkIncludes("module-smoke не проверяет React GanttRowsLayer", browserQaSources.join("\n"), "React GanttRowsLayer contract is missing");
checkIncludes("module-smoke не проверяет явную маркировку отложенных owner-команд", browserQaSources.join("\n"), "deferred owner actions are not explicitly marked");
checkIncludes("module-smoke не проверяет fail-closed поверхность команды расписания", browserQaSources.join("\n"), "schedule command must be present or explicitly fail closed");
checkIncludes("module-smoke не проверяет идентичность React row/lane", browserQaSources.join("\n"), "React row/lane identity drift");
checkIncludes("module-smoke не проверяет уникальность физических slot ids", browserQaSources.join("\n"), "physical slot ids are missing or duplicated");
checkIncludes("module-smoke не проверяет геометрию React slot", browserQaSources.join("\n"), "React slot has empty geometry");
checkIncludes("module-smoke не проверяет выбор точного физического React slot", browserQaSources.join("\n"), "React slot selection did not stay on the exact physical slot");
checkIncludes("module-smoke должен использовать эталонный MacBook Air 15 viewport", browserQaSources.join("\n"), "macbook-air-15");
const publicRegistryModuleIds = getMesModuleNavigationDefinitions({ adminHost: false, includeStandalone: true })
  .map((moduleItem) => moduleItem.id);
const adminRegistryModuleIds = new Set(
  getMesModuleNavigationDefinitions({ adminHost: true, includeStandalone: false })
    .map((moduleItem) => moduleItem.id)
);
const expectedPublicRuntimeModuleIds = [...new Set([
  ...SPECIAL_UI_RUNTIME_MODULE_IDS,
  ...HARD_UI_RUNTIME_MODULE_IDS,
  ...PARTIAL_UI_RUNTIME_MODULE_IDS,
])].filter((moduleId) => !adminRegistryModuleIds.has(moduleId));
expectedPublicRuntimeModuleIds.forEach((moduleId) => {
  if (!publicRegistryModuleIds.includes(moduleId)) {
    fail(`Публичный runtime-модуль отсутствует в module_registry: ${moduleId}`);
  }
});
checkIncludes("Design snapshots не используют единый module_registry", designSnapshotsSource, "getMesModuleNavigationDefinitions");
checkIncludes("Design snapshots не исключают admin-only модули из public sweep", designSnapshotsSource, "adminOnlyModuleIds");
["visualSystem", "planningTable", "supply", "shopMap", "employees"].forEach((moduleId) => {
  checkNoMatches(`Удаленный/архивный модуль ${moduleId} не должен возвращаться в runtime contracts`, uiRuntimeContractsAllSource, new RegExp(`"${moduleId}"`));
  checkNoMatches(`Удаленный/архивный модуль ${moduleId} не должен возвращаться в visual QA`, designSnapshotsSource, new RegExp(`"${moduleId}"`));
});
checkIncludes("ui_runtime_contracts должен выводить runtime coverage из Blueprint registry", uiRuntimeContractsAllSource, "MES_MODULE_BLUEPRINT_REGISTRY");
checkIncludes("ui_runtime_contracts должен фиксировать standard runtime kind", uiRuntimeContractsAllSource, "MES_MODULE_RUNTIME_KINDS.STANDARD");
checkIncludes("ui_runtime_contracts должен фиксировать special runtime kind", uiRuntimeContractsAllSource, "MES_MODULE_RUNTIME_KINDS.SPECIAL");
checkIncludes("ui_runtime_contracts должен фиксировать partial runtime contracts", uiRuntimeContractsAllSource, "export const PARTIAL_UI_RUNTIME_CONTRACTS = Object.freeze({})");
checkIncludes("ui_runtime_contracts должен фиксировать отсутствие legacy-модулей", uiRuntimeContractsAllSource, "export const LEGACY_UI_RUNTIME_MODULE_IDS = Object.freeze([])");
checkIncludes("UI runtime coverage QA должен проверять special runtime contracts", uiRuntimeCoverageQaSource, "Special UI runtime modules are missing runtime contracts");
checkIncludes("UI runtime coverage QA должен проверять partial runtime contracts", uiRuntimeCoverageQaSource, "Partial UI runtime modules require explicit contracts");
checkIncludes("UI runtime coverage QA должен фейлить возврат legacy-модулей", uiRuntimeCoverageQaSource, "expects no legacy modules after special runtime gates");
checkIncludes("UI runtime coverage QA не подключен к qa:ui", packageSource, "ui-runtime-coverage-qa.mjs");
checkIncludes("UI runtime class audit не подключен к qa:ui/qa:syntax", packageSource, "ui-runtime-class-audit.mjs");
checkIncludes("UI Core не фиксирует runtime marker CSS contract", uiCoreStylesSource, "[data-ui-component=\"FormField\"] :is(input, select, textarea)");
checkNoMatches("QA-скрипты не должны использовать устаревший UI storage key v2", browserQaSources.join("\n"), /mes-planning-prototype-ui-v2/);
checkIncludes("Design snapshots не проверяют unmarked UI components", designSnapshotsSource, "const unmarkedComponents = []");
checkIncludes("Design snapshots не фейлят unmarked UI components", designSnapshotsSource, "audit.counts.unmarkedComponents > 0");
checkIncludes("Design snapshots не подключают hard-runtime список для жесткой типографики", designSnapshotsSource, "HARD_UI_RUNTIME_MODULE_IDS");
checkIncludes("Design snapshots не подключают special-runtime список для покрытия specialized-модулей", designSnapshotsSource, "SPECIAL_UI_RUNTIME_MODULE_IDS");
checkIncludes("Design snapshots не подключают partial-runtime список для обязательного покрытия", designSnapshotsSource, "PARTIAL_UI_RUNTIME_MODULE_IDS");
checkIncludes("Design snapshots должны падать, если runtime-модуль не попал в визуальный прогон", designSnapshotsSource, "design-qa-snapshots is missing runtime modules");
checkIncludes("Design snapshots должны падать, если runtime-модуль не попал в focus-прогон", designSnapshotsSource, "design-qa-snapshots focus mode is missing runtime modules");
checkIncludes("Design snapshots не фейлят typographyWarnings в hard-runtime модулях", designSnapshotsSource, "hardUiRuntimeModules.has(audit.module) && audit.counts.typographyWarnings > 0");
checkIncludes("Документ speed-pass не фиксирует Scroll-contract", speedDocsSource, "Scroll-contract для новых модулей");
checkIncludes("Документ speed-pass не фиксирует runtime normalizer", speedDocsSource, "applyUiRuntimeContracts()");
checkIncludes("Документ speed-pass не фиксирует opened states visual QA", speedDocsSource, "opened states");
checkIncludes("Документ component map не фиксирует runtime normalizer", componentMapDocsSource, "Runtime normalizer");
checkIncludes("Матрица ролей должна исключать системный экран authPrototype", accessRolesModuleSource, "if (!id || id === \"authPrototype\") return []");
if (!/id:\s*"authSessionPrototype"[^\n]*groupId:\s*"operations"/.test(moduleRegistrySource)) {
  fail("Главный сайдбар должен держать Рабочий стол в Оперативном управлении через единый module registry");
}
checkNoMatches("Главный сайдбар не должен возвращать группу UX-макетов", runtimeSource, /UX-макеты|ids:\s*\[[^\]]*"visualSystem"[^\]]*\]/);
checkNoMatches("authPrototype нельзя возвращать в группы главного меню", appSource, /ids:\s*\[[^\]]*"authPrototype"[^\]]*\]/);
checkNoMatches("Запрещено возвращать старую route/admin/staff авторизацию", appSource, /AUTH_PROTOTYPE_ADMIN_ROLES|authPrototype(?:Route|AdminRole|AdminPersonId|Staff)|data-auth-(?:route|admin|staff)|renderAuthPrototype(?:Admin|Staff)|normalizeAuthPrototype(?:Route|Admin)/);
checkNoMatches("Запрещено возвращать CSS старой route/staff авторизации", `${stylesSource}\n${uiCoreStylesSource}`, /auth-prototype-(?:route-tabs|staff-(?:route|login|pin|result)|department-strip|executor-grid|role-grid|search)/);
checkNoMatches("Auth back-кнопки не должны использовать departments/info icon", appSource, /label:\s*"К (?:участкам|отделам)"[^}]*iconName:\s*"departments"/);
checkNoMatches("Runtime не должен возвращать отдельную 'служебную роль' авторизации", appSource, /Служебная роль|служебн(?:ая|ой) роль/);
checkNoMatches("bootstrap-snapshot не должен хранить состояние авторизации", bootstrapSnapshotSource, /authPrototype|authGate|authCurrent|\\"activeRole\\":\\"operator\\"|"activeRole"\s*:\s*"operator"/);
checkNoMatches("bootstrap-snapshot не должен хранить старые UI-паттерны", bootstrapSnapshotSource, /planning-v2|shiftMasterScenario|shiftMasterHmi|shiftMasterV2|shift-method-|warehouse-(?:page|panel|sidebar)|\brkd\b|app-global-search|update-popup|module-entity|project-/i);

const removedSearchPattern = /type="search"|app-global-search|data-directory-filter-search|searchInput|ui\.search|directory-search|module-search|filter-search/;

checkNoMatches("Запрещен runtime global/search input после удаления поиска", appSource, removedSearchPattern);
checkNoMatches("Запрещено возвращать update-popup в runtime", appSource, /Обновление готово|UPDATE_DISMISSED|UPDATE_CHECK|data-update-(?:refresh|dismiss)|update-popup|update-banner/);
checkNoMatches("Запрещено возвращать breadcrumbs в runtime", appSource, /app-breadcrumbs/);
checkNoMatches("Запрещено возвращать breadcrumbs в CSS", stylesSource, /\.app-breadcrumbs\b/);
checkNoMatches("Запрещено возвращать breadcrumbs в UI Core CSS", uiCoreStylesSource, /\.app-breadcrumbs\b/);
checkNoMatches("Запрещено возвращать search-field в CSS", stylesSource, /\.search-field\b/);
checkNoMatches("Запрещено возвращать search-field в UI Core CSS", uiCoreStylesSource, /\.search-field\b/);
checkNoMatches("Запрещено возвращать CSS классы удаленного поиска", stylesSource, /(?:\.|data-)(?:directory-search|module-search|filter-search)\b/);
checkNoMatches("Запрещено возвращать CSS классы удаленного поиска в UI Core", uiCoreStylesSource, /(?:\.|data-)(?:directory-search|module-search|filter-search)\b/);
checkNoMatches("Запрещено возвращать старые демо-ветки Мастерской в runtime", appSource, /shiftMasterScenario|shiftMasterHmi|renderShiftMasterScenario|renderShiftMasterHmi/i);
checkNoMatches("Запрещено возвращать CSS старых демо-веток Мастерской", stylesSource, /shiftMasterScenario|shiftMasterHmi/i);
checkNoMatches("Запрещено возвращать CSS старой Мастерской v2", stylesSource, /shiftMasterV2|shift-master-v2/i);
checkNoMatches("Запрещено возвращать старый shift-method runtime/CSS слой Мастерской", `${appSource}\n${stylesSource}`, /shift-method-|data-shift-method|renderShiftMasterMethod|bindShiftMasterMethod/);
checkNoMatches("Запрещено возвращать старую доску Мастерской в runtime", appSource, /renderShiftMasterPage|renderShiftMasterDemo|renderShiftMasterOrderCard|renderShiftMasterRow\(|updateShiftMasterAssignment|updateShiftMasterFact|issueShiftMasterRows|data-shift-master-(?:scope|login|select|resource|employee|note)/);
checkNoMatches("Запрещено возвращать CSS старой доски Мастерской", stylesSource, /shift-master-(?:scope|login|section-card|order-flow|row(?:-|\b)|demo-(?!badge))/);
checkNoMatches("Запрещено возвращать мертвые CSS-хвосты текущей доски Мастерской", stylesSource, /shift-master-board-(?:load(?!-tooltip\b)|detail-head)/);
checkNoMatches("Запрещено возвращать старый module-entity runtime/CSS слой", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /module-entity-(?:item|list|title)|module-list-label/);
checkNoMatches("Боковые элементы нельзя писать вручную как class=\"ui-sidebar-item\"; использовать renderUiSidebarItem", appSource, /class="[^"]*\bui-sidebar-item(?:\s|")/);
checkNoMatches("Живые страницы нельзя собирать ручным literal module-data-page; использовать renderUiModulePage", appSource, /<section class="[^"]*\bmodule-data-page\b/);
checkNoMatches("Запрещено возвращать удаленный object-tree экранный слой", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /object-tree|renderTreePage|getObjectTreeStats|renderSystemObjectTree|renderObjectTree/);
checkNoMatches("Запрещено возвращать старый spec-constructor/spec-structure слой; использовать текущий speki runtime", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /spec-constructor|spec-structure-(?:panel|table|table-wrap)|data-(?:dense-)?spec-structure|data-specification-/);
checkNoMatches("Запрещено возвращать универсальный старый ghost-button", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /ghost-button/);
checkNoMatches("Запрещено возвращать старые кастомные кнопки помощника Ганта", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /mini-action|assistant-command/);
checkNoMatches("Запрещено возвращать ручные KPI-карточки в сайдбар План-таблицы", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /planning-table-sidebar-card/);
checkNoMatches("Запрещено возвращать старый batch-row/actions слой Заказ-нарядов", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /planning-(?:v2|order)-batch-(?:actions|row|grid)/);
checkNoMatches("Запрещено возвращать старые planning-v2 UI class names", `${indexSource}\n${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /planning-v2/);
checkNoMatches("Запрещено возвращать Planning Workbench v2 runtime names", `${indexSource}\n${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /renderPlanningWorkbenchV2|planning-workbench-v2-shell/);
checkNoMatches(
  "Запрещено возвращать старый planning work editor: work-nav/required/composition/order-placement ручной слой",
  `${indexSource}\n${appSource}\n${stylesSource}\n${uiCoreStylesSource}`,
  /\b(?:renderPlanningWorkbench|renderPlanningWorkNavigator|getPlanningWorkNavStateLabel|renderPlanningWorkNavButton|renderPlanningWorkDetail|renderPlanningTaskDetail|renderPlanningProductionChainDetail|renderPlanningSupplyDetail|renderPlanningStepSummaryRow|renderPlanningStepDetail|renderPlanningCompositionPanel|renderPlanningOperationsByComposition|renderPlanningOrderPlacementConstructor|renderPlanningRequiredSettings|renderPlanningRouteDetails|renderPlanningOrderQuantityBlock|getNextPlanningBatchNumber|createPlanningBatch|updatePlanningBatchField|distributePlanningBatchesEvenly|acceptPlanningBatchTotal|requestDeletePlanningBatch|deletePlanningBatch)\b|data-planning-(?:route-step-line|order-placement)|planning-(?:work-nav|work-summary-grid|work-step-row|required(?:-|-panel)|composition(?:-|-panel)|operations-panel|operation-|order-placement-(?:constructor|actions|row|table|head|state)|route-(?:content|card|meta|quantity|steps)|multiplication|readonly-summary|bpp-field|step-detail-panel|supply-(?:row|mode-group))/,
);
checkNoMatches(
  "Запрещено возвращать мертвые CSS-хвосты planning-order/scada старого UI",
  `${stylesSource}\n${uiCoreStylesSource}`,
  /planning-order-(?:board|content|flow-mode|lanes|phase-strip|tool-panel)|planning-route-note|scada-/,
);
checkNoMatches("Запрещено возвращать старые project-* UI class names", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, removedProjectUiPattern);
checkNoMatches("Запрещено возвращать старый warehouse-slot Gantt marker", `${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /warehouse-slot/);
checkNoMatches("Запрещено возвращать старую рабочую доску Диспетчерской", `${appSource}\n${stylesSource}`, /renderDispatch(?:SelectedFactCard|LaborAnalyticsRow|FactLane|FactBar|FactRow|Checkpoint|CurrentFocus|Kpi|SidebarRoute|WorkCenterRow|SlotBar|Signal|RouteTableRow)|dispatch-(?:route-card|kpi-card|fact-|labor-row|current-focus|workcenter-row|signal-item|checkpoint-card|table|sidebar|workspace|content|header|kpi-grid|rhythm-panel|shift-panel|signal-panel|route-panel)/);
checkNoMatches("Запрещено возвращать старый write-path Диспетчерской", appSource, /updateDispatchFact|acceptDispatchFactFromMasterRow|syncPlanningCorrectionFromDispatchFact|fillDispatchFactsFromRows|clearDispatchFactsForRows|bindDispatchEvents/);
checkNoMatches("PlanningTable wrappers не должны возвращать shorthand overflow:auto", stylesSource, /planning-table-(?:matrix|register|compact)-wrap[\s\S]{0,260}overflow:\s*auto\b/);
checkNoMatches("PlanningTable wrappers не должны выпускать таблицы наружу через overflow-x:visible", stylesSource, /planning-table-(?:matrix|register|compact)-wrap[\s\S]{0,260}overflow-x:\s*visible\b/);
checkNoMatches("Запрещено возвращать мертвый CSS модуля Склад", stylesSource, /data-layout-page="warehouse"|warehouse-page|warehouse-panel|warehouse-table|warehouse-sidebar|warehouse-kpi|warehouse-role|warehouse-balance|warehouse-availability|warehouse-type|warehouse-production-quantity/);
checkNoMatches("Запрещено возвращать runtime модуля Склад", appSource, /data-layout-page="warehouse"|warehouse-page|warehouse-panel|warehouse-table|warehouse-sidebar/);
checkNoMatches("Запрещено возвращать отдельный удаленный модуль РКД в runtime/CSS", `${indexSource}\n${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /data-layout-page\s*=\s*["']rkd["']|(?:[?&]module|module)\s*=\s*["']?rkd\b|id:\s*["']rkd["']|activeModule\s*={2,3}\s*["']rkd["']/i);
checkIncludes("Черновик РКД остаётся частью Спецификаций 2.0", runtimeSource, "specifications2-rkd-");
checkNoMatches("Запрещено возвращать удаленные reports/debug модули в runtime/CSS", `${indexSource}\n${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, removedReportDebugModulePattern);
checkNoMatches("Запрещено возвращать старый dashboard layout в runtime/CSS", `${indexSource}\n${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, removedDashboardLayoutPattern);
checkNoMatches("Запрещено возвращать старые standalone shell классы project/specification", `${indexSource}\n${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, removedStandaloneShellPattern);
checkNoMatches("Запрещено возвращать самостоятельный bomLists layout; платы живут внутри Номенклатуры", `${indexSource}\n${appSource}\n${stylesSource}\n${uiCoreStylesSource}`, /data-layout-page="bomLists"|bom-list-app-shell/);
checkNoMatches("Module panels не должны владеть внутренним vertical scroll", stylesSource, /(?:^|\n)[^{]*\.module-panel[^{]*\{[^}]*overflow(?:-y)?\s*:\s*(?:auto|scroll)\b/);
checkNoCssRule(
  "Workspace grid rule не должен протекать на .ui-sidebar-item/strong/small/em",
  stylesSource,
  (selector, body) => /ui-sidebar-item/.test(selector)
    && /module-data-workspace/.test(selector)
    && /display\s*:\s*grid\b/i.test(body),
);

const appLines = appSource.split("\n");
appLines.forEach((line, index) => {
  if (!line.includes("<aside class=\"directory-sidebar module-data-sidebar")) return;
  const block = appLines.slice(index, Math.min(appLines.length, index + 90)).join("\n");
  const hasSidebarList = block.includes("ui-sidebar-list");
  const hasNomenclatureFilter = block.includes("renderNomenclatureSectionFilter");
  if (!hasSidebarList && !hasNomenclatureFilter) {
    fail(`module-data-sidebar без ui-sidebar-list или номенклатурного фильтра: line ${index + 1}`);
  }
});

const visualViewportNames = Array.from(designSnapshotsSource.matchAll(/\{\s*name:\s*"([^"]+)"/g)).map((match) => match[1]);
if (visualViewportNames.length !== 1 || visualViewportNames[0] !== "macbook-air-15") {
  fail(`design-qa-snapshots должен проверять один эталонный viewport macbook-air-15, найдено: ${visualViewportNames.join(", ") || "нет"}`);
}
[
  "productionStructureMatrix",
  "roles",
].forEach((moduleId) => {
  if (!publicRegistryModuleIds.includes(moduleId)) {
    fail(`module_registry должен включать системный модуль ${moduleId}`);
  }
});
[
  "authPrototype-departments",
  "authPrototype-pin",
  "production-structure-entity-editor-open",
].forEach((stateId) => {
  if (!designSnapshotsSource.includes(stateId)) {
    fail(`design-qa-snapshots должен проверять состояние ${stateId}`);
  }
});

const packageJson = JSON.parse(packageSource);
if (!packageJson.scripts?.["qa:ui"]?.includes("node scripts/ui-contract-qa.mjs")
  || !packageJson.scripts?.["qa:ui"]?.includes("node scripts/ui-runtime-coverage-qa.mjs")) {
  fail("В package.json нет scripts.qa:ui");
}
if (packageJson.scripts?.["qa:legacy"] !== "node scripts/legacy-inventory.mjs") {
  fail("В package.json нет scripts.qa:legacy");
}
if (!packageJson.scripts?.["qa:architecture"]?.includes("npm run qa:flow")
  || !packageJson.scripts?.["qa:architecture"]?.includes("npm run qa:ui")
  || !packageJson.scripts?.["qa:architecture"]?.includes("npm run qa:legacy")
  || !packageJson.scripts?.["qa:architecture"]?.includes("npm run qa:css")) {
  fail("scripts.qa:architecture должен запускать flow, ui, legacy и css gates");
}
const sharedStateQaScript = packageJson.scripts?.["qa:shared-state"] || "";
if (!sharedStateQaScript.includes("node scripts/shared-state-functional-qa.mjs")) {
  fail("scripts.qa:shared-state должен запускать shared-state-functional-qa.mjs");
}
if (packageJson.scripts?.["qa:module-smoke:inner"] !== "node scripts/module-smoke-qa.mjs"
  || !packageJson.scripts?.["qa:module-smoke"]?.startsWith("npm run build &&")
  || !packageJson.scripts?.["qa:module-smoke"]?.includes("scripts/run-with-dist-preview.mjs")
  || !packageJson.scripts?.["qa:module-smoke"]?.includes("npm run qa:module-smoke:inner")) {
  fail("scripts.qa:module-smoke должен проверять свежий dist через dist-preview wrapper, а inner-команда должна запускать module-smoke-qa.mjs");
}
const recursiveSyntaxQa = packageJson.scripts?.["qa:syntax"]?.includes("scripts/syntax-qa.mjs");
if (!recursiveSyntaxQa && (!packageJson.scripts?.["qa:syntax"]?.includes("src/validation.js")
  || !packageJson.scripts?.["qa:syntax"]?.includes("scripts/run-with-local-server.mjs")
  || !packageJson.scripts?.["qa:syntax"]?.includes("scripts/design-qa-snapshots.mjs")
  || !packageJson.scripts?.["qa:syntax"]?.includes("scripts/planning-labor-functional-qa.mjs")
  || !packageJson.scripts?.["qa:syntax"]?.includes("scripts/module-smoke-qa.mjs")
  || !packageJson.scripts?.["qa:syntax"]?.includes("scripts/shift-operational-flow-functional-qa.mjs")
  || !packageJson.scripts?.["qa:syntax"]?.includes("scripts/auth-functional-qa.mjs"))) {
  fail("scripts.qa:syntax должен проверять src/validation.js, visual QA, planning-labor QA, module-smoke QA, shift-flow QA, auth QA и local-server wrapper");
}
const functionalScript = packageJson.scripts?.["qa:functional:inner"] || packageJson.scripts?.["qa:functional"] || "";
if (!functionalScript.includes("npm run qa:shared-state")
  || !functionalScript.includes("npm run qa:module-smoke")
  || !functionalScript.includes("npm run qa:shift-flow")
  || !functionalScript.includes("npm run qa:auth")
  || !functionalScript.includes("npm run qa:roles")) {
  fail("scripts.qa:functional не запускает shared-state, module-smoke, shift-flow, auth и roles gates");
}
if (!packageJson.scripts?.["qa:functional"]?.startsWith("npm run build &&")
  || !packageJson.scripts?.["qa:functional"]?.includes("scripts/run-with-dist-preview.mjs")) {
  fail("scripts.qa:functional должен проверять свежий release dist через dist-preview wrapper");
}
if (!localServerWrapperSource.includes("/bootstrap-snapshot.json")) {
  fail("run-with-local-server.mjs должен проверять свежесть bootstrap-snapshot.json, чтобы browser QA не смотрел старый snapshot");
}
if (!localServerWrapperSource.includes("MES_QA_URL: targetUrl.toString()")) {
  fail("run-with-local-server.mjs должен прокидывать MES_QA_URL дочерним browser QA-скриптам");
}
browserQaScriptFiles.forEach((file, index) => {
  if (!browserQaSources[index].includes("process.env.MES_QA_URL")) {
    fail(`${file} должен использовать process.env.MES_QA_URL с fallback на localhost:4174`);
  }
});
[
  ["qa:state", "qa:state:inner"],
  ["qa:planning-labor", "qa:planning-labor:inner"],
  ["qa:timesheet", "qa:timesheet:inner"],
  ["qa:gantt-operational", "qa:gantt-operational:inner"],
  ["qa:shift-flow", "qa:shift-flow:inner"],
  ["qa:auth", "qa:auth:inner"],
  ["qa:boot", "qa:boot:inner"],
].forEach(([outerName, innerName]) => {
  const expectedWrapper = outerName === "qa:boot" ? "scripts/run-with-dist-preview.mjs" : "scripts/run-with-local-server.mjs";
  if (!packageJson.scripts?.[innerName] || !packageJson.scripts?.[outerName]?.includes(expectedWrapper) || !packageJson.scripts?.[outerName]?.includes(`npm run ${innerName}`)) {
    fail(`scripts.${outerName} должен запускаться через ${expectedWrapper} и ${innerName}`);
  }
});
if (packageJson.scripts?.["qa:roles"] !== "npm run qa:roles:inner"
  || !packageJson.scripts?.["qa:roles:inner"]?.includes("roles-react-runtime-policy-qa.mjs")) {
  fail("scripts.qa:roles должен запускать прямой nonvisual React/server-contract gate");
}
if (packageJson.scripts?.["qa:shift-master-board"] !== "npm run qa:shift-master-board:inner"
  || !packageJson.scripts?.["qa:shift-master-board:inner"]?.includes("shift-master-board-react-runtime-policy-qa.mjs")
  || !packageJson.scripts?.["qa:shift-master-board:inner"]?.includes("shift-master-board-command-owner-qa.mjs")
  || !packageJson.scripts?.["qa:shift-master-board:inner"]?.includes("qa:shift-master-board-server-bridge")) {
  fail("scripts.qa:shift-master-board должен запускать прямой nonvisual React/owner/server-contract gate");
}
if (/"qa:shift-master"\s*:|"qa:shift-master-v2"\s*:|shift-master-functional-qa|shift-master-v2-functional-qa/.test(JSON.stringify(packageJson.scripts || {}))) {
  fail("package.json не должен возвращать QA-команды удаленных старых мастерских");
}
if (!packageJson.scripts?.["qa:visual"]?.startsWith("npm run build &&")) {
  fail("scripts.qa:visual должен сначала выполнять build, чтобы visual QA не проверял stale dist");
}
if (!packageJson.scripts?.["qa:stabilize"]?.includes("npm run qa:syntax")) {
  fail("scripts.qa:stabilize должен начинаться с qa:syntax");
}
if (!packageJson.scripts?.["qa:stabilize"]?.includes("npm run qa:architecture")) {
  fail("scripts.qa:stabilize должен запускать qa:architecture");
}
if (!packageJson.scripts?.["qa:stabilize"]?.includes("git diff --check")
  || !packageJson.scripts?.["qa:stabilize"]?.includes("npm run build")) {
  fail("scripts.qa:stabilize должен запускать git diff --check и build");
}
if (!packageJson.scripts?.["qa:nonvisual"]?.includes("npm run qa:stabilize")
  || !packageJson.scripts?.["qa:nonvisual"]?.includes("npm run qa:functional")) {
  fail("scripts.qa:nonvisual должен запускать stabilize и functional");
}
if (/qa:(?:mobile|visual)/.test(packageJson.scripts?.["qa:nonvisual"] || "")) {
  fail("scripts.qa:nonvisual не должен запускать mobile/visual QA");
}
if (packageJson.scripts?.["qa:night"]?.includes("qa:mobile")) {
  fail("scripts.qa:night должен проверять только MacBook Air 15 через qa:visual; qa:mobile запускается только вручную");
}

console.log("MES UI Contract QA");
console.log(`UI helpers: ${requiredUiHelpers.length}`);
console.log(`CSS selectors: ${requiredUiCss.length}`);
console.log(`UI component markers: ${requiredUiComponentMarkers.length}`);
console.log("Forbidden runtime patterns: search, breadcrumbs, update-popup, old shift master demos, removed RKD/reports/debug/dashboard, old standalone shells, standalone bomLists layout, ghost-button, old assistant buttons, old dispatch board");
console.log("Shell/sidebar contracts: renderUiAppShell and module-data-sidebar are guarded");
console.log("QA scripts: stabilize, functional, nonvisual and MacBook-only night contracts are guarded");

if (warnings.length) {
  console.log("\nWarnings:");
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("\nOK: UI contract is guarded.");
