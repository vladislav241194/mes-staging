import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MES_DOCUMENT_KINDS,
  MES_FLOW_TRANSITIONS,
  MES_MODULE_FLOW_CONTRACTS,
  MES_MODULE_FLOW_SEQUENCE,
  MES_STATUS_CONTRACTS,
  getMesGanttInfluenceMatrix,
  getMesFlowTransition,
  getMesStatusContract,
} from "../src/mes_contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const appPath = path.join(rootDir, "src", "app.js");
const validationPath = path.join(rootDir, "src", "validation.js");
const sharedStateEndpointPath = path.join(rootDir, "scripts", "shared-state-endpoint.mjs");
const stateConsistencyQaPath = path.join(rootDir, "scripts", "state-consistency-qa.mjs");
const docsPath = path.join(rootDir, "docs", "mes-contract-migration-v1.md");
const packagePath = path.join(rootDir, "package.json");

const [appSource, validationSource, sharedStateEndpointSource, stateConsistencyQaSource, docsSource, packageSource] = await Promise.all([
  fs.readFile(appPath, "utf8"),
  fs.readFile(validationPath, "utf8"),
  fs.readFile(sharedStateEndpointPath, "utf8"),
  fs.readFile(stateConsistencyQaPath, "utf8"),
  fs.readFile(docsPath, "utf8"),
  fs.readFile(packagePath, "utf8"),
]);

const failures = [];
const warnings = [];

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

function isLineInRanges(lineNumber, ranges) {
  return ranges.filter(Boolean).some(([start, end]) => lineNumber >= start && lineNumber <= end);
}

function findFunctionRange(source, functionName) {
  const lines = source.split("\n");
  const startIndex = lines.findIndex((line) => new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`).test(line));
  if (startIndex === -1) {
    fail(`Не найдена helper/function зона для QA: ${functionName}`);
    return null;
  }

  let depth = 0;
  let hasOpened = false;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (opens) hasOpened = true;
    depth += opens - closes;
    if (hasOpened && depth <= 0) return [startIndex + 1, index + 1];
  }

  fail(`Не удалось определить границы функции для QA: ${functionName}`);
  return null;
}

function getSourceRange(source, range) {
  if (!range) return "";
  const lines = source.split("\n");
  return lines.slice(range[0] - 1, range[1]).join("\n");
}

function getStringConstMap(source) {
  return new Map([...source.matchAll(/\bconst\s+([A-Z0-9_]+)\s*=\s*"([^"]+)";/g)].map((match) => [match[1], match[2]]));
}

function extractStringArray(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!match) {
    fail(`Не найден массив ${constName}`);
    return [];
  }
  const constMap = getStringConstMap(source);
  return [...match[1].matchAll(/"([^"]+)"|\b([A-Z][A-Z0-9_]+)\b/g)]
    .map((item) => item[1] || constMap.get(item[2]) || "")
    .filter(Boolean);
}

function extractStringSet(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) {
    fail(`Не найден Set ${constName}`);
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const requiredDocumentKinds = [
  "routeCard",
  "workOrder",
  "shiftWorkOrder",
  "ganttSlot",
  "dispatchFact",
];

requiredDocumentKinds.forEach((kind) => {
  if (!MES_DOCUMENT_KINDS[kind]) fail(`Нет MES_DOCUMENT_KINDS.${kind}`);
});

const requiredTransitions = [
  "routeCardToWorkOrder",
  "workOrderToGanttSlot",
  "ganttSlotToShiftWorkOrder",
  "shiftWorkOrderIssue",
  "shiftWorkOrderToDispatchFact",
  "dispatchFactToPlanningCorrection",
];

const requiredModuleFlow = [
  "nomenclature",
  "products",
  "routes",
  "planning",
  "gantt",
  "shiftMasterBoard",
  "shiftWorkOrders",
  "dispatch",
  "productionStructureMatrix",
  "employees",
  "timesheet",
  "roles",
  "directories",
  "visualSystem",
  "authPrototype",
  "authSessionPrototype",
  "planningTable",
  "supply",
  "shopMap",
];
const allowedModuleGroups = new Set(["Технологии", "Планирование нагрузки", "Оперативное управление", "Система", "UX-макеты", "Авторизация"]);
const runtimeModulesHiddenFromSidebar = new Set(["authPrototype"]);
const expectedSidebarGroups = [
  { label: "Планирование нагрузки", ids: ["gantt", "planning", "weeklyProductionControl"] },
  { label: "Оперативное управление", ids: ["dispatch", "shiftMasterBoard", "authSessionPrototype", "shiftWorkOrders"] },
  { label: "Технологии", ids: ["routes", "products", "nomenclature"] },
  { label: "Система", ids: ["productionStructureMatrix", "employees", "timesheet", "roles", "directories"] },
  { label: "UX-макеты", ids: ["visualSystem", "planningTable", "supply", "shopMap"] },
];
const allowedGanttImpacts = new Set([
  "none",
  "none-current",
  "indirect",
  "indirect-operational",
  "writes-on-transfer",
  "direct",
  "visual-operational-layer",
  "visual-operational-layer-demo",
]);

requiredTransitions.forEach((transitionId) => {
  if (!getMesFlowTransition(transitionId)) fail(`Нет MES_FLOW_TRANSITIONS.${transitionId}`);
});

const shiftFactTransition = getMesFlowTransition("shiftWorkOrderToDispatchFact");
if (shiftFactTransition?.targetModule === "Диспетчерская") {
  fail("shiftWorkOrderToDispatchFact не должен целиться в активную Диспетчерскую; факт пишет Мастерская в Архив факта.");
}

const dispatchCorrectionTransition = getMesFlowTransition("dispatchFactToPlanningCorrection");
if (dispatchCorrectionTransition?.sourceModule === "Диспетчерская") {
  fail("dispatchFactToPlanningCorrection не должен исходить из placeholder-модуля Диспетчерская; источник должен быть Архив факта.");
}

requiredModuleFlow.forEach((moduleId) => {
  const contract = MES_MODULE_FLOW_CONTRACTS[moduleId];
  if (!contract) fail(`Нет MES_MODULE_FLOW_CONTRACTS.${moduleId}`);
  if (contract && !contract.label) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId} без label`);
  if (contract && !contract.role) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId} без role/topbar annotation`);
  if (contract && !Array.isArray(contract.reads)) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId}.reads должен быть массивом`);
  if (contract && !Array.isArray(contract.writes)) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId}.writes должен быть массивом`);
  if (contract && !contract.ganttImpact) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId} без ganttImpact`);
  if (contract && !contract.ganttVisualChange) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId} без ganttVisualChange`);
  if (contract && !contract.editPolicy) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId} без editPolicy`);
  if (contract && !allowedModuleGroups.has(contract.group)) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId} имеет неизвестную группу: ${contract.group}`);
  if (contract && !allowedGanttImpacts.has(contract.ganttImpact)) fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId} имеет неизвестный ganttImpact: ${contract.ganttImpact}`);
});

const dispatchContract = MES_MODULE_FLOW_CONTRACTS.dispatch;
if (dispatchContract) {
  if (dispatchContract.ganttImpact !== "none") fail("Диспетчерская должна оставаться без влияния на Гант до нового ТЗ.");
  if (dispatchContract.reads.length || dispatchContract.writes.length) fail("Диспетчерская должна оставаться placeholder без reads/writes до нового ТЗ.");
}
if (/planningState\.dispatchFacts\s*=/.test(appSource)) {
  fail("Runtime не должен писать в planningState.dispatchFacts; Диспетчерская placeholder, а факты идут через ui.shiftMasterBoardFacts/Архив факта.");
}

const moduleDefinitionsSource = getSourceRange(appSource, findFunctionRange(appSource, "getModuleDefinitions"));
const runtimeModuleIds = [...moduleDefinitionsSource.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((match) => match[1]);
runtimeModuleIds.forEach((moduleId) => {
  if (!MES_MODULE_FLOW_CONTRACTS[moduleId]) {
    fail(`Runtime module без MES_MODULE_FLOW_CONTRACTS: ${moduleId}`);
  }
});
Object.keys(MES_MODULE_FLOW_CONTRACTS).forEach((moduleId) => {
  if (!runtimeModuleIds.includes(moduleId)) {
    fail(`MES_MODULE_FLOW_CONTRACTS.${moduleId} отсутствует в getModuleDefinitions()`);
  }
});

const moduleGroupsSource = getSourceRange(appSource, findFunctionRange(appSource, "getModuleGroups"));
const moduleSidebarGroups = new Map();
const actualSidebarGroups = [...moduleGroupsSource.matchAll(/\{\s*label:\s*"([^"]+)",\s*ids:\s*\[([^\]]*)\]/g)].map((match) => ({
  label: match[1],
  ids: [...match[2].matchAll(/"([^"]+)"/g)].map((idMatch) => idMatch[1]),
}));
if (JSON.stringify(actualSidebarGroups) !== JSON.stringify(expectedSidebarGroups)) {
  fail(`Порядок групп главного меню расходится с MES sidebar contract: ${JSON.stringify(actualSidebarGroups)}`);
}
actualSidebarGroups.forEach((group) => {
  const label = group.label;
  const ids = group.ids;
  ids.forEach((moduleId) => {
    if (moduleSidebarGroups.has(moduleId)) fail(`Модуль ${moduleId} повторяется в группах главного меню`);
    moduleSidebarGroups.set(moduleId, label);
  });
});
runtimeModuleIds.forEach((moduleId) => {
  if (runtimeModulesHiddenFromSidebar.has(moduleId)) return;
  if (!moduleSidebarGroups.has(moduleId)) fail(`Runtime module отсутствует в группах главного меню: ${moduleId}`);
  const contractGroup = MES_MODULE_FLOW_CONTRACTS[moduleId]?.group;
  const sidebarGroup = moduleSidebarGroups.get(moduleId);
  if (contractGroup && sidebarGroup && contractGroup !== sidebarGroup) {
    fail(`Группа модуля ${moduleId} расходится: sidebar="${sidebarGroup}", contract="${contractGroup}"`);
  }
});

const directorySectionsMatch = appSource.match(/const\s+directorySections\s*=\s*\[([\s\S]*?)\];/);
if (!directorySectionsMatch) {
  fail("Не найден массив directorySections");
} else {
  const directorySectionIds = [...directorySectionsMatch[1].matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
  const expectedDirectorySections = ["operations", "componentTypes", "nomenclatureTypes", "statuses"];
  if (JSON.stringify(directorySectionIds) !== JSON.stringify(expectedDirectorySections)) {
    fail(`Справочники должны содержать только ${expectedDirectorySections.join(", ")}; найдено: ${directorySectionIds.join(", ")}`);
  }
  ["workCenters", "departments", "resources", "equipment", "productionResources", "norms", "employees"].forEach((legacySectionId) => {
    if (directorySectionIds.includes(legacySectionId)) {
      fail(`Старый производственный раздел не должен возвращаться в справочники: ${legacySectionId}`);
    }
  });
}
const deepLinkDirectorySource = getSourceRange(appSource, findFunctionRange(appSource, "isDeepLinkDirectorySectionId"));
["workCenters", "departments", "resources", "equipment", "productionResources", "norms", "employees"].forEach((legacySectionId) => {
  if (deepLinkDirectorySource.includes(`"${legacySectionId}"`)) {
    fail(`Старый производственный раздел не должен быть валидным deep-link справочника: ${legacySectionId}`);
  }
});

const slotRouteHelperSource = getSourceRange(appSource, findFunctionRange(appSource, "getSlotRoute"));
if (!slotRouteHelperSource.includes("getSlotRouteId(slot, planningState)")) {
  fail("getSlotRoute() должен сначала использовать getSlotRouteId(), чтобы не расходились routeId/planningOrderId alias.");
}
const slotPlanningOrderHelperSource = getSourceRange(appSource, findFunctionRange(appSource, "getSlotPlanningOrderId"));
if (!slotPlanningOrderHelperSource.includes("slot.planningOrderId || slot.routeId || fallbackRouteId || slot.batchId")) {
  fail("getSlotPlanningOrderId() должен держать legacy batchId последним fallback после planningOrderId/routeId.");
}
const validationPlanningOrderHelperSource = getSourceRange(validationSource, findFunctionRange(validationSource, "getValidationPlanningOrderId"));
if (!validationPlanningOrderHelperSource.includes("slot?.planningOrderId || slot?.routeId || slot?.batchId")) {
  fail("getValidationPlanningOrderId() должен держать legacy batchId последним fallback после planningOrderId/routeId.");
}
if (!stateConsistencyQaSource.includes("slot?.planningOrderId || slot?.routeId || step?.routeId || slot?.batchId")) {
  fail("state-consistency QA должен проверять planningOrderId/routeId/step.routeId до legacy batchId.");
}

MES_MODULE_FLOW_SEQUENCE.forEach((moduleId) => {
  if (!MES_MODULE_FLOW_CONTRACTS[moduleId]) fail(`MES_MODULE_FLOW_SEQUENCE содержит модуль без contract: ${moduleId}`);
});

if (getMesGanttInfluenceMatrix().length !== MES_MODULE_FLOW_SEQUENCE.length) {
  fail("Матрица влияния модулей на Gantt не совпадает с MES_MODULE_FLOW_SEQUENCE");
}
const directScheduleRouteToGanttCalls = findLines(appSource, /schedulePlanningRouteToGantt\(/);
if (directScheduleRouteToGanttCalls.length !== 2) {
  fail(`schedulePlanningRouteToGantt() должен объявляться и вызываться только из Заказ-нарядов: ${directScheduleRouteToGanttCalls.map((item) => item.number).join(", ")}`);
}
checkNoMatches("Маршрутная карта не должна иметь прямую кнопку передачи в Gantt", appSource, /data-route-(?:card-)?to-gantt|data-routes?-to-gantt/);

const appSharedStateValueKeys = extractStringArray(appSource, "SHARED_STATE_VALUE_KEYS");
const endpointAllowedValueKeys = new Set(extractStringSet(sharedStateEndpointSource, "ALLOWED_VALUE_KEYS"));
appSharedStateValueKeys.forEach((key) => {
  if (!endpointAllowedValueKeys.has(key)) {
    fail(`Shared-state endpoint не принимает клиентский ключ SHARED_STATE_VALUE_KEYS: ${key}`);
  }
});
const endpointAllowedSharedUiKeys = new Set(extractStringSet(sharedStateEndpointSource, "ALLOWED_SHARED_UI_KEYS"));
[
  "productionStructureMatrixOverrides",
  "timesheetCellOverrides",
  "timesheetScheduleOverrides",
  "shiftMasterBoardAssignments",
  "shiftMasterBoardFacts",
  "shiftMasterAssignmentMatrix",
  "accessRoleProfiles",
  "accessRoleAssignments",
].forEach((key) => {
  if (!endpointAllowedSharedUiKeys.has(key)) {
    fail(`Shared-state endpoint не принимает рабочий sharedUi ключ: ${key}`);
  }
});
if (!sharedStateEndpointSource.includes('key === "accessRoleProfiles"')) {
  fail("Shared-state endpoint должен явно разрешать массив accessRoleProfiles и не открывать массивы для всех sharedUi ключей.");
}

const externalStorageSyncSource = getSourceRange(appSource, findFunctionRange(appSource, "bindExternalStorageSync"));
const syncExternalStorageStateSource = getSourceRange(appSource, findFunctionRange(appSource, "syncExternalStorageState"));
const workflowPresetValueKeys = extractStringArray(appSource, "WORKFLOW_PRESET_VALUE_KEYS");
const applyWorkflowPresetValuesSource = getSourceRange(appSource, findFunctionRange(appSource, "applyWorkflowPresetValues"));
["STORAGE_KEY", "DIRECTORY_STORAGE_KEY", "DIRECTORY_DEFAULTS_STORAGE_KEY", "DIRECTORY_DELETED_ENTITIES_STORAGE_KEY", "SUPPLY_CONTROL_STORAGE_KEY"].forEach((keyName) => {
  if (!externalStorageSyncSource.includes(keyName)) {
    fail(`bindExternalStorageSync() не слушает общий storage key: ${keyName}`);
  }
});
if (!syncExternalStorageStateSource.includes("supplyControlState = loadSupplyControlState()")) {
  fail("syncExternalStorageState() должен обновлять supplyControlState при изменении SUPPLY_CONTROL_STORAGE_KEY");
}
if (!workflowPresetValueKeys.includes("mes-planning-prototype-supply-control-v1")) {
  fail("WORKFLOW_PRESET_VALUE_KEYS должен сохранять supply-control слой вместе с рабочим пресетом");
}
if (!applyWorkflowPresetValuesSource.includes("supplyControlState = loadSupplyControlState()")) {
  fail("applyWorkflowPresetValues() должен восстанавливать supplyControlState из рабочего пресета");
}

const statusKeys = new Set();
MES_STATUS_CONTRACTS.forEach((status) => {
  const key = `${status.scope}:${status.value}`;
  if (!status.scope || !status.value) fail(`Статус без scope/value: ${JSON.stringify(status)}`);
  if (statusKeys.has(key)) fail(`Дубликат MES_STATUS_CONTRACTS: ${key}`);
  statusKeys.add(key);
  if (!status.kind) fail(`Статус без kind: ${key}`);
  if (!status.label) fail(`Статус без label: ${key}`);
  if (["shiftAssignment", "dispatchFact"].includes(status.scope) && status.modules?.includes("Диспетчерская")) {
    fail(`${key} не должен ссылаться на placeholder-модуль Диспетчерская; используйте Мастерская/Архив факта.`);
  }
});
if (getMesStatusContract("workOrderPlanning", "planned")) {
  fail("getMesStatusContract() не должен подставлять ganttSlot:planned для workOrderPlanning:planned");
}
if (!getMesStatusContract("", "planned")) {
  fail("getMesStatusContract() без scope должен сохранять backward-compatible lookup по value");
}

MES_FLOW_TRANSITIONS.forEach((transition) => {
  ["id", "from", "to", "statusScope", "nextStatus", "dataPolicy", "sourceModule", "targetModule"].forEach((field) => {
    if (!transition[field]) fail(`Переход ${transition.id || "без id"} без ${field}`);
  });
  if (!MES_DOCUMENT_KINDS[transition.from]) fail(`Переход ${transition.id} с неизвестным from=${transition.from}`);
  if (!MES_DOCUMENT_KINDS[transition.to]) fail(`Переход ${transition.id} с неизвестным to=${transition.to}`);
  const endpointLabels = new Set([
    ...Object.values(MES_MODULE_FLOW_CONTRACTS).map((module) => module.label),
    ...Object.values(MES_DOCUMENT_KINDS).map((kind) => kind.label),
  ]);
  if (!endpointLabels.has(transition.sourceModule)) fail(`Переход ${transition.id} с неизвестным sourceModule="${transition.sourceModule}"`);
  if (!endpointLabels.has(transition.targetModule)) fail(`Переход ${transition.id} с неизвестным targetModule="${transition.targetModule}"`);
  if (!statusKeys.has(`${transition.statusScope}:${transition.nextStatus}`)) {
    fail(`Переход ${transition.id} выставляет статус без контракта: ${transition.statusScope}:${transition.nextStatus}`);
  }
});

checkNoMatches("Запрещен прямой CSS-класс status-${slot.status}", appSource, /status-\$\{slot\.status\}/);
checkNoMatches("Запрещен прямой label GANTT_SLOT_STATUS_LABELS[slot.status]", appSource, /GANTT_SLOT_STATUS_LABELS\[slot\.status\]/);
checkNoMatches("Запрещено прямое сравнение slot.status", appSource, /slot\.status\s*(?:={2,3}|!={1,2})/);
checkNoMatches("Запрещено прямое сравнение route.planningStatus", appSource, /route\.planningStatus\s*(?:={2,3}|!={1,2})/);
checkNoMatches("Запрещено создавать legacy planningStatus=planned в runtime", appSource, /planningStatus\s*:\s*[^,\n]*["']planned["']/);
checkNoMatches("Запрещено возвращать legacy status row route-planned", appSource, /id:\s*["']route-planned["']/);
checkNoMatches("Запрещено возвращать default status workOrderPlanning:planned", appSource, /contractScope:\s*["']workOrderPlanning["'][\s\S]{0,260}code:\s*["']planned["']|code:\s*["']planned["'][\s\S]{0,260}contractScope:\s*["']workOrderPlanning["']/);
checkNoMatches("Запрещен новый UI на SLOT_STATUSES.map", appSource, /SLOT_STATUSES\.map\s*\(/);
checkNoMatches("Запрещен legacy STATUS_LABELS[slot.status]", appSource, /STATUS_LABELS\[slot\.status\]/);

if (!appSource.includes("function getGanttSlotStatusView")) fail("Нет helper getGanttSlotStatusView()");
if (!appSource.includes("function getWorkOrderPlanningStatusValue")) fail("Нет helper getWorkOrderPlanningStatusValue()");
[
  "function getSlotRouteId",
  "function getSlotPlanningOrderId",
  "function getSlotProductionContextId",
  "function slotMatchesProductionContext",
  "function slotMatchesPlanningOrder",
].forEach((helper) => {
  if (!appSource.includes(helper)) fail(`Нет slot compatibility helper: ${helper}`);
});
if (!appSource.includes("getMesFlowTransitionsForStatus")) fail("Справочник статусов не показывает переходы по status scope/value");
if (!docsSource.includes("npm run qa:flow")) fail("Документация не описывает qa:flow");

const packageJson = JSON.parse(packageSource);
if (packageJson.scripts?.["qa:flow"] !== "node scripts/flow-contract-qa.mjs") {
  fail("В package.json нет scripts.qa:flow");
}

const legacyProjectIdCount = findLines(appSource, /\bprojectId\b/).length;
const legacyBatchIdCount = findLines(appSource, /\bbatchId\b/).length;
const directSlotProductionComparisons = findLines(appSource, /slot\.(?:projectId|specificationId)\s*(?:={2,3}|!={1,2})/).length;
const directSlotPlanningOrderComparisons = findLines(appSource, /slot\.(?:batchId|planningOrderId|routeId)\s*(?:={2,3}|!={1,2})/).length;
const legacySlotReadAllowedRanges = [
  "migrateProjectEntityToSpecifications",
  "normalizePlanningState",
  "getSlotRouteId",
  "getSlotPlanningOrderId",
  "getSlotProductionContextId",
  "slotMatchesProductionContext",
  "slotMatchesPlanningOrder",
].map((functionName) => findFunctionRange(appSource, functionName));
const legacyWarningReadAllowedRanges = [
  "getWarningProductionId",
  "getWarningPlanningOrderId",
].map((functionName) => findFunctionRange(appSource, functionName));
const directLegacySlotReads = findLines(appSource, /\bslot\.(?:projectId|batchId)\b/)
  .filter((item) => !isLineInRanges(item.number, legacySlotReadAllowedRanges));
const directLegacyWarningReads = findLines(appSource, /\bwarning\.(?:projectId|batchId)\b/)
  .filter((item) => !isLineInRanges(item.number, legacyWarningReadAllowedRanges));
const validationSlotAliasAllowedRanges = [
  "getValidationPlanningOrderId",
  "getValidationSlotRouteId",
  "getValidationProductionId",
].map((functionName) => findFunctionRange(validationSource, functionName));
const directValidationSlotAliasReads = findLines(validationSource, /\bslot\??\.(?:projectId|specificationId|batchId|planningOrderId|routeId)\b/)
  .filter((item) => !isLineInRanges(item.number, validationSlotAliasAllowedRanges));
const validationSlotStatusAllowedRanges = [
  "getValidationSlotStatusValue",
  "validationSlotHasStatus",
].map((functionName) => findFunctionRange(validationSource, functionName));
const directValidationSlotStatusComparisons = findLines(validationSource, /\bslot\??\.status\s*(?:={2,3}|!={1,2})/)
  .filter((item) => !isLineInRanges(item.number, validationSlotStatusAllowedRanges));
const legacyValidationWarningPayloads = findLines(validationSource, /^\s*(?:projectId|batchId):/);
if (legacyProjectIdCount > 0) {
  warn(`projectId все еще присутствует как legacy alias: ${legacyProjectIdCount} строк. Это допустимо только в compatibility/helper зонах.`);
}
if (legacyBatchIdCount > 0) {
  warn(`batchId все еще присутствует как legacy alias: ${legacyBatchIdCount} строк. Не использовать как новую бизнес-сущность.`);
}
if (directSlotProductionComparisons > 0) {
  fail(`Прямые сравнения slot.projectId/specificationId: ${directSlotProductionComparisons}. Используйте slotMatchesProductionContext().`);
}
if (directSlotPlanningOrderComparisons > 0) {
  fail(`Прямые сравнения slot.batchId/planningOrderId/routeId: ${directSlotPlanningOrderComparisons}. Используйте slotMatchesPlanningOrder() или getSlotRouteId().`);
}
if (directLegacySlotReads.length) {
  fail(`Прямое чтение slot.projectId/slot.batchId вне migration/helper зон: ${directLegacySlotReads.map((item) => item.number).join(", ")}. Используйте getSlotProductionContextId()/getSlotPlanningOrderId().`);
}
if (directLegacyWarningReads.length) {
  fail(`Прямое чтение warning.projectId/warning.batchId вне helper-зоны: ${directLegacyWarningReads.map((item) => item.number).join(", ")}. Используйте getWarningProductionId()/getWarningPlanningOrderId().`);
}
if (directValidationSlotAliasReads.length) {
  fail(`Validation читает slot alias напрямую вне helper-зоны: ${directValidationSlotAliasReads.map((item) => item.number).join(", ")}. Используйте getValidationPlanningOrderId()/getValidationSlotRouteId()/getValidationProductionId().`);
}
if (directValidationSlotStatusComparisons.length) {
  fail(`Validation сравнивает slot.status напрямую вне helper-зоны: ${directValidationSlotStatusComparisons.map((item) => item.number).join(", ")}. Используйте validationSlotHasStatus().`);
}
if (legacyValidationWarningPayloads.length) {
  fail(`Validation не должен формировать warning payload через projectId/batchId: ${legacyValidationWarningPayloads.map((item) => item.number).join(", ")}. Используйте productionId/planningOrderId.`);
}

console.log("MES Flow Contract QA");
console.log(`Документы: ${requiredDocumentKinds.length}`);
console.log(`Переходы: ${MES_FLOW_TRANSITIONS.length}`);
console.log(`Модульные контракты: ${Object.keys(MES_MODULE_FLOW_CONTRACTS).length}`);
console.log(`Статусы: ${MES_STATUS_CONTRACTS.length}`);

if (warnings.length) {
  console.log("\nWarnings:");
  warnings.forEach((message) => console.log(`- ${message}`));
}

if (failures.length) {
  console.error("\nFailures:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log("\nOK: flow contracts are guarded.");
