import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

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
    if (entry.isFile() && entry.name.endsWith(".css")) files.push(relativePath);
  }
  return files;
}

const cssTrackedFiles = ["styles.css", ...await collectCssFiles()];

const trackedFiles = [
  "index.html",
  "src/app.js",
  "src/production_structure_matrix_data.js",
  "src/production_structure_service.js",
  "src/validation.js",
  "src/mes_contracts.js",
  "src/types.js",
  "scripts/mobile-qa.mjs",
  "scripts/ui-contract-qa.mjs",
  "scripts/flow-contract-qa.mjs",
  "scripts/production-structure-matrix-qa.mjs",
  "docs/mes-contract-migration-v1.md",
  "docs/mes-prototyping-speed-v1.md",
  "docs/object-relationship-map.md",
  "bootstrap-snapshot.json",
  ...cssTrackedFiles,
];

async function readExisting(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  try {
    return {
      relativePath,
      source: await fs.readFile(absolutePath, "utf8"),
    };
  } catch (error) {
    if (error.code === "ENOENT") return { relativePath, source: "" };
    throw error;
  }
}

const files = await Promise.all(trackedFiles.map(readExisting));
const byPath = new Map(files.map((file) => [file.relativePath, file.source]));
const removedReportDebugModulePattern = /reports-page|report-sidebar|report-workspace|report-(?:app-shell|content|main|chart-grid|chart-card|table-card|insights|dashboard-workspace|header|kpi|kpi-grid)|debug-(?:action-menu|app-shell|check-list|chip-select|combobox|command-input|content|dense-row|drawer|drawer-backdrop|dropdown-menu|dropdown-panel|error-tip|index|inline-options|inline-select|menu-panel|metric-popover|mini-list|modal-grid|popover|popover-stage|segment-label|select-button|spec-grid|status-select|stepper-card|stepper-grid|steps|tree-select|usage-grid|validation|wizard-modal)|debug-page|debug-sidebar|debug-workspace|debug-card|debug-section|data-layout-page="(?:reports|debug)"|module=(?:reports|debug)|id:\s*["'](?:reports|debug)["']|activeModule\s*={2,3}\s*["'](?:reports|debug)["']/;
const removedDashboardLayoutPattern = /dashboard-app-shell|dashboard-page|dashboard-control-room|dashboard-header|dashboard-time|dashboard-grid|dashboard-status-grid|dashboard-workspace|data-layout-page="dashboard"|module=dashboard|id:\s*["']dashboard["']|activeModule\s*={2,3}\s*["']dashboard["']/;
const removedStandaloneRkdModulePattern = /data-layout-page\s*=\s*["']rkd["']|(?:[?&]module|module)\s*=\s*["']?rkd\b|id:\s*["']rkd["']|activeModule\s*={2,3}\s*["']rkd["']/i;
const removedStandaloneShellPattern = /(?:project|specification)-app-shell/;
const removedProjectUiPattern = /project-(?:binding|list|card|row|panel|relation|route|main|name-line|meta|status|readiness|module-content|editor-panel)|projectBinding|projectList|director-project-|data-focus-project/;

function countMatches(source, regexp) {
  return Array.from(source.matchAll(new RegExp(regexp.source, regexp.flags.includes("g") ? regexp.flags : `${regexp.flags}g`))).length;
}

function findLineNumbers(source, regexp, limit = 8) {
  return source
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => regexp.test(line))
    .slice(0, limit)
    .map(({ number }) => number);
}

function countAcrossFiles(regexp, relativePaths = trackedFiles) {
  const expandedPaths = relativePaths.flatMap((relativePath) => (
    relativePath === "styles.css" || relativePath === "styles/mes-ui-core.css"
      ? cssTrackedFiles
      : [relativePath]
  ));
  const pathSet = new Set(expandedPaths);
  return files.filter((file) => pathSet.has(file.relativePath)).map((file) => ({
    path: file.relativePath,
    count: countMatches(file.source, regexp),
    lines: findLineNumbers(file.source, regexp),
  })).filter((item) => item.count > 0);
}

function sum(items) {
  return items.reduce((total, item) => total + item.count, 0);
}

const hardForbidden = [
  {
    id: "global-search-runtime",
    label: "Глобальный поиск в runtime",
    regexp: /type="search"|app-global-search|data-directory-filter-search|searchInput|ui\.search|directory-search|module-search|filter-search/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Поиск удален из shell и CSS; возврат считается UI-регрессией.",
  },
  {
    id: "breadcrumbs-runtime",
    label: "Хлебные крошки в runtime/CSS",
    regexp: /app-breadcrumbs|\.app-breadcrumbs\b/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Breadcrumbs удалены из проекта.",
  },
  {
    id: "update-popup-runtime",
    label: "Update-popup в runtime/CSS",
    regexp: /Обновление готово|UPDATE_DISMISSED|UPDATE_CHECK|data-update-(?:refresh|dismiss)|update-popup|update-banner/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Баннер обновления удален из проекта.",
  },
  {
    id: "old-shift-master-demos",
    label: "Старые демо-ветки Мастерской",
    regexp: /shiftMasterScenario|shiftMasterHmi|renderShiftMasterScenario|renderShiftMasterHmi/i,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Основной модуль Мастерская должен оставаться текущей доской shiftMasterBoard.",
  },
  {
    id: "old-shift-master-writers",
    label: "Старые write-функции Мастерской",
    regexp: /updateShiftMasterAssignment|updateShiftMasterFact|issueShiftMasterRows/,
    files: ["src/app.js"],
    note: "Новые назначения и факт Мастерской пишутся только в ui.shiftMasterBoard*; planningState.shiftMasterAssignments остается read/compatibility слоем.",
  },
  {
    id: "rkd-module",
    label: "Удаленный standalone-модуль РКД",
    regexp: removedStandaloneRkdModulePattern,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "РКД не должен возвращаться как самостоятельный runtime/CSS/module alias. Встроенный черновик specifications2-rkd-* — часть Спецификаций 2.0 и проверяется отдельным контрактом.",
  },
  {
    id: "planning-v2-batch-row-layer",
    label: "Старый batch-row/actions слой Заказ-нарядов",
    regexp: /planning-(?:v2|order)-batch-(?:actions|row|grid)/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "В заказ-нарядах оставлен только контейнер planning-order-batch-editor для сводки; старые row/actions/grid удалены.",
  },
  {
    id: "old-planning-v2-class-names",
    label: "Старые planning-v2 UI class names",
    regexp: /planning-v2/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Заказ-наряды перешли на planning-order-* naming; planning-v2 не должен возвращаться в runtime/CSS.",
  },
  {
    id: "old-planning-workbench-v2-runtime",
    label: "Старые Planning Workbench v2 runtime names",
    regexp: /renderPlanningWorkbenchV2|planning-workbench-v2-shell/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Заказ-наряды используют нейтральный renderPlanningWorkbench* runtime naming без v2.",
  },
  {
    id: "old-planning-work-editor-layer",
    label: "Старый planning work editor слой",
    regexp: /\b(?:renderPlanningWorkbench|renderPlanningWorkNavigator|getPlanningWorkNavStateLabel|renderPlanningWorkNavButton|renderPlanningWorkDetail|renderPlanningTaskDetail|renderPlanningProductionChainDetail|renderPlanningSupplyDetail|renderPlanningStepSummaryRow|renderPlanningStepDetail|renderPlanningCompositionPanel|renderPlanningOperationsByComposition|renderPlanningOrderPlacementConstructor|renderPlanningRequiredSettings|renderPlanningRouteDetails|renderPlanningOrderQuantityBlock|getNextPlanningBatchNumber|createPlanningBatch|updatePlanningBatchField|distributePlanningBatchesEvenly|acceptPlanningBatchTotal|requestDeletePlanningBatch|deletePlanningBatch)\b|data-planning-(?:route-step-line|order-placement)|planning-(?:work-nav|work-summary-grid|work-step-row|required(?:-|-panel)|composition(?:-|-panel)|operations-panel|operation-|order-placement-(?:constructor|actions|row|table|head|state)|route-(?:content|card|meta|quantity|steps)|multiplication|readonly-summary|bpp-field|step-detail-panel|supply-(?:row|mode-group))/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Старый ручной редактор заказ-нарядов удален; текущий модуль использует planning-order/workbench runtime и UI-kit.",
  },
  {
    id: "old-auth-planning-scada-css-tails",
    label: "Мертвые CSS-хвосты auth/planning-order/scada",
    regexp: /auth-prototype-(?:route-tabs|staff-(?:route|login|pin|result)|department-strip|executor-grid|role-grid|search)|planning-order-(?:board|checkpoints|content|flow-mode|lanes|phase-strip|tool-panel)|planning-route-note|scada-/,
    files: ["styles.css", "styles/mes-ui-core.css"],
    note: "Удаленные CSS-остатки старой route/staff авторизации, planning-order макетов и SCADA-экранов не должны возвращаться.",
  },
  {
    id: "old-shift-master-board-css-tails",
    label: "Мертвые CSS-хвосты текущей доски Мастерской",
    regexp: /shift-master-board-(?:load(?!-tooltip\b)|detail-head)/,
    files: ["styles.css", "styles/mes-ui-core.css"],
    note: "Старый общий load-блок и старый detail-head удалены; рабочая карточка и загрузка исполнителей живут в текущих карточных секциях. shift-master-board-load-tooltip — действующий tooltip нагрузки.",
  },
  {
    id: "standalone-bom-lists-layout",
    label: "Старый standalone bomLists layout",
    regexp: /data-layout-page="bomLists"|bom-list-app-shell/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Платы/BOM остаются данными Номенклатуры; отдельный экран bomLists не должен возвращаться.",
  },
  {
    id: "old-dashboard-layout",
    label: "Старый dashboard layout",
    regexp: removedDashboardLayoutPattern,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Старый SCADA/dashboard-экран удален; новые обзорные модули должны собираться через текущий shell/UI-kit.",
  },
  {
    id: "old-standalone-app-shells",
    label: "Старые standalone app-shell классы",
    regexp: removedStandaloneShellPattern,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "project/specification standalone shell удалены; встроенные блоки должны жить внутри текущих модулей.",
  },
  {
    id: "old-object-tree-page",
    label: "Старый object-tree экран",
    regexp: /object-tree|renderTreePage|getObjectTreeStats|renderSystemObjectTree|renderObjectTree/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Старый экран дерева объектов удален; текущая структура живет в hard-runtime модуле Структура.",
  },
  {
    id: "old-spec-constructor-layer",
    label: "Старый spec-constructor/spec-structure слой",
    regexp: /spec-constructor|spec-structure-(?:panel|table|table-wrap)|data-(?:dense-)?spec-structure|data-specification-/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Старый экран спецификаций удален; текущий модуль использует speki runtime.",
  },
  {
    id: "old-gantt-assistant-buttons",
    label: "Старые кастомные кнопки помощника Ганта",
    regexp: /mini-action|assistant-command/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Кнопки помощника Ганта должны использовать стандартный secondary-button с тонкими локальными классами.",
  },
  {
    id: "old-dispatch-workbench",
    label: "Старая рабочая доска Диспетчерской",
    regexp: /renderDispatch(?:SelectedFactCard|LaborAnalyticsRow|FactLane|FactBar|FactRow|Checkpoint|CurrentFocus|Kpi|SidebarRoute|WorkCenterRow|SlotBar|Signal|RouteTableRow)|dispatch-(?:route-card|kpi-card|fact-|labor-row|current-focus|workcenter-row|signal-item|checkpoint-card|table|sidebar|workspace|content|header|kpi-grid|rhythm-panel|shift-panel|signal-panel|route-panel)/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Диспетчерская сейчас является placeholder-модулем; старый рабочий стол не должен возвращаться без нового ТЗ.",
  },
  {
    id: "old-dispatch-writers",
    label: "Старый write-path Диспетчерской",
    regexp: /updateDispatchFact|acceptDispatchFactFromMasterRow|syncPlanningCorrectionFromDispatchFact|fillDispatchFactsFromRows|clearDispatchFactsForRows|bindDispatchEvents/,
    files: ["src/app.js"],
    note: "Диспетчерская сейчас placeholder; новые факты приходят из Мастерской/архива факта, а не из старой Диспетчерской.",
  },
  {
    id: "old-auth-route-admin-staff",
    label: "Старая route/admin/staff авторизация",
    regexp: /AUTH_PROTOTYPE_ADMIN_ROLES|authPrototype(?:Route|AdminRole|AdminPersonId|Staff)|data-auth-(?:route|admin|staff)|renderAuthPrototype(?:Admin|Staff)|normalizeAuthPrototype(?:Route|Admin)/,
    files: ["src/app.js", "bootstrap-snapshot.json"],
    note: "Авторизация стала единым планшетным wizard: отдел -> участок -> сотрудник -> PIN; служебные роли задаются после входа через роли.",
  },
  {
    id: "bootstrap-snapshot-old-ui-state",
    label: "Старое UI/auth состояние в bootstrap-snapshot",
    regexp: /authPrototype|authGate|authCurrent|\\"activeRole\\":\\"operator\\"|"activeRole"\s*:\s*"operator"|planning-v2|shiftMasterScenario|shiftMasterHmi|shiftMasterV2|shift-method-|warehouse-(?:page|panel|sidebar)|\brkd\b|app-global-search|update-popup|module-entity|project-/i,
    files: ["bootstrap-snapshot.json"],
    note: "Workflow seed не должен восстанавливать старые UI-слои или transient-состояние авторизации.",
  },
  {
    id: "old-project-ui-class-names",
    label: "Старые project-* UI class names",
    regexp: removedProjectUiPattern,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Визуальный слой больше не должен использовать старую проектную лексику; использовать specification/production/route naming.",
  },
  {
    id: "old-warehouse-slot-class",
    label: "Старый warehouse-slot Gantt marker",
    regexp: /warehouse-slot/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    note: "Для передаточных/складских операций использовать material-transfer-slot; не возвращать имя удаленного модуля Склад в Gantt marker.",
  },
];

const compatibilityDebt = [
  {
    id: "projectId",
    label: "projectId",
    regexp: /\bprojectId\b/,
    files: ["src/app.js", "src/validation.js", "src/mes_contracts.js", "src/types.js"],
    maxCount: 126,
    allowed: "Только compatibility/helper/migration зоны: alias для specificationId.",
  },
  {
    id: "batchId",
    label: "batchId",
    regexp: /\bbatchId\b/,
    files: ["src/app.js", "src/validation.js", "src/types.js"],
    maxCount: 8,
    allowed: "Только legacy alias для routeId/planningOrderId; не новая сущность партии.",
  },
  {
    id: "planning-batch",
    label: "planning-batch",
    regexp: /planning-batch/,
    files: ["src/app.js", "styles.css"],
    maxCount: 0,
    allowed: "Legacy имя старого конструктора заказ-нарядов удалено из runtime/CSS; возврат запрещен.",
  },
  {
    id: "planning-demo-labor",
    label: "legacy planning demo storage keys",
    regexp: /planningDemo|planningManualDemo/,
    files: ["src/app.js"],
    maxCount: 4,
    allowed: "Только чтение старых localStorage/route keys при миграции в planningLaborNote/planningLaborByStepId.",
  },
  {
    id: "shiftMasterAliases",
    label: "shiftMaster/shiftMasterContext/shiftMasterV2 URL aliases",
    regexp: /\b(?:shiftMaster|shiftMasterContext|shiftMasterV2)\s*:\s*"shiftMasterBoard"|data-layout-page="(?:shiftMaster|shiftMasterContext|shiftMasterV2)"/,
    files: ["src/app.js", "styles.css"],
    maxCount: 3,
    allowed: "Только URL/module alias в normalizeDeepLinkModuleId; layout-page должен быть shiftMasterBoard.",
  },
  {
    id: "reportCardHeadCompat",
    label: "report-card-head compatibility class in runtime",
    regexp: /report-card-head/,
    files: ["src/app.js"],
    maxCount: 0,
    allowed: "Runtime больше не должен выпускать report-card-head; новый заголовок панели идет через ui-panel-head.",
  },
];

const cssLegacy = [
  {
    id: "material-transfer-slot-live",
    label: "material-transfer-slot live Gantt marker",
    regexp: /material-transfer-slot/,
    allowed: "Пока live-маркер складских/выдачных слотов Gantt. Не использовать как модуль Склад.",
  },
  {
    id: "warehouse-page-css",
    label: "warehouse page selectors",
    regexp: /data-layout-page="warehouse"|warehouse-page|warehouse-panel|warehouse-table|warehouse-sidebar|warehouse-kpi|warehouse-role|warehouse-balance|warehouse-availability|warehouse-type|warehouse-production-quantity/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    allowed: "Должно быть 0: модуль Склад выпилен. material-transfer-slot/is-warehouse учитываются отдельным live-маркером.",
  },
  {
    id: "shift-master-v2-css",
    label: "old shift master v2 CSS",
    regexp: /shiftMasterV2|shift-master-v2/i,
    files: ["styles.css", "styles/mes-ui-core.css"],
    maxCount: 0,
    allowed: "Должно быть 0: старая Мастерская v2 удалена, URL alias может жить только в runtime redirect.",
  },
  {
    id: "removed-module-entity-runtime-css",
    label: "Удаленный module-entity runtime/CSS слой",
    regexp: /module-entity-(?:item|list|title)|module-list-label/,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    maxCount: 0,
    allowed: "Должно быть 0: боковые списки используют ui-sidebar-list/ui-sidebar-label/ui-sidebar-item.",
  },
  {
    id: "removed-report-debug-runtime-css",
    label: "Удаленный reports/debug runtime/CSS слой",
    regexp: removedReportDebugModulePattern,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    maxCount: 0,
    allowed: "Должно быть 0: старые reports/debug модули и marker overlay удалены.",
  },
  {
    id: "removed-dashboard-runtime-css",
    label: "Удаленный dashboard runtime/CSS слой",
    regexp: removedDashboardLayoutPattern,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    maxCount: 0,
    allowed: "Должно быть 0: старый dashboard layout удален; новые обзорные экраны идут через renderUiAppShell/module-panel.",
  },
  {
    id: "removed-standalone-app-shells",
    label: "Удаленные standalone app-shell классы",
    regexp: removedStandaloneShellPattern,
    files: ["index.html", "src/app.js", "styles.css", "styles/mes-ui-core.css"],
    maxCount: 0,
    allowed: "Должно быть 0: project/specification shell больше не существуют как отдельные экраны.",
  },
  {
    id: "old-sidebar-specific-patterns",
    label: "module-specific sidebar CSS overrides",
    regexp: /(?:speki-page|nomenclature-page|shop-map-sidebar|data-layout-page="(?:planning|bomLists)"|planning-page:not|module-data-page \.module-data-sidebar|app-shell\[data-layout-page="planning"\])[\s\S]{0,180}module-entity-(?:item|list)/,
    files: ["styles.css", "docs/mes-prototyping-speed-v1.md"],
    maxCount: 0,
    allowed: "Должно быть 0: module-specific sidebar CSS больше не должен ссылаться на module-entity-*.",
  },
];

const appSource = byPath.get("src/app.js") || "";
const stylesSource = cssTrackedFiles.map((file) => byPath.get(file) || "").join("\n");

const requiredFacades = [
  "getSlotRouteId",
  "getSlotPlanningOrderId",
  "getSlotProductionContextId",
  "slotMatchesProductionContext",
  "slotMatchesPlanningOrder",
  "normalizeSlotOrderLink",
  "getWorkOrderPlanningStatusValue",
  "getGanttSlotViewModel",
  "getShiftWorkOrderViewModel",
  "getDispatchFactViewModel",
  "getMesStatusView",
  "getMesGanttInfluenceMatrix",
  "getWarningProductionId",
  "getWarningPlanningOrderId",
];

const facadeSources = [
  appSource,
  byPath.get("src/mes_contracts.js") || "",
  byPath.get("src/validation.js") || "",
];
const missingFacades = requiredFacades.filter((name) => !facadeSources.some((source) => source.includes(name)));
const failures = [];

console.log("MES Legacy Inventory");
console.log(`Files scanned: ${files.length}`);
console.log(`Runtime size: src/app.js ${appSource.split("\n").length} lines, CSS graph ${stylesSource.split("\n").length} lines`);

console.log("\nHard forbidden patterns");
hardForbidden.forEach((item) => {
  const matches = countAcrossFiles(item.regexp, item.files);
  const total = sum(matches);
  console.log(`- ${item.label}: ${total}`);
  if (total) {
    failures.push(`${item.label}: ${matches.map((match) => `${match.path}:${match.lines.join(",")}`).join("; ")}`);
    console.log(`  ${item.note}`);
  }
});

console.log("\nCompatibility debt");
compatibilityDebt.forEach((item) => {
  const matches = countAcrossFiles(item.regexp, item.files || trackedFiles);
  const total = sum(matches);
  console.log(`- ${item.label}: ${total}`);
  console.log(`  ${item.allowed}`);
  if (Number.isFinite(item.maxCount)) {
    console.log(`  budget: <= ${item.maxCount}`);
    if (total > item.maxCount) {
      failures.push(`${item.label} grew above legacy budget: ${total} > ${item.maxCount}`);
    }
  }
  matches.slice(0, 5).forEach((match) => {
    console.log(`  ${match.path}: ${match.count}${match.lines.length ? ` (sample lines ${match.lines.join(", ")})` : ""}`);
  });
});

console.log("\nCSS legacy map");
cssLegacy.forEach((item) => {
  const matches = countAcrossFiles(item.regexp, item.files || trackedFiles);
  const total = sum(matches);
  console.log(`- ${item.label}: ${total}`);
  console.log(`  ${item.allowed}`);
  if (Number.isFinite(item.maxCount)) {
    console.log(`  budget: <= ${item.maxCount}`);
    if (total > item.maxCount) {
      failures.push(`${item.label} grew above legacy budget: ${total} > ${item.maxCount}`);
    }
  }
  matches.slice(0, 5).forEach((match) => {
    console.log(`  ${match.path}: ${match.count}${match.lines.length ? ` (sample lines ${match.lines.join(", ")})` : ""}`);
  });
  if (item.id === "warehouse-page-css" && total) {
    failures.push(`${item.label}: ${matches.map((match) => `${match.path}:${match.lines.join(",")}`).join("; ")}`);
  }
});

console.log("\nRequired facade/helper anchors");
if (missingFacades.length) {
  failures.push(`Missing facade anchors: ${missingFacades.join(", ")}`);
  missingFacades.forEach((name) => console.log(`- missing ${name}`));
} else {
  requiredFacades.forEach((name) => console.log(`- ${name}`));
}

if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("\nOK: legacy inventory generated. Compatibility debt remains explicit.");
