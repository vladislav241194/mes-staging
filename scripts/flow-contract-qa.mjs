import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MES_DOCUMENT_KINDS,
  MES_FLOW_TRANSITIONS,
  MES_STATUS_CONTRACTS,
  getMesFlowTransition,
} from "../src/mes_contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const appPath = path.join(rootDir, "src", "app.js");
const docsPath = path.join(rootDir, "docs", "mes-contract-migration-v1.md");
const packagePath = path.join(rootDir, "package.json");

const [appSource, docsSource, packageSource] = await Promise.all([
  fs.readFile(appPath, "utf8"),
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

requiredTransitions.forEach((transitionId) => {
  if (!getMesFlowTransition(transitionId)) fail(`Нет MES_FLOW_TRANSITIONS.${transitionId}`);
});

const statusKeys = new Set();
MES_STATUS_CONTRACTS.forEach((status) => {
  const key = `${status.scope}:${status.value}`;
  if (!status.scope || !status.value) fail(`Статус без scope/value: ${JSON.stringify(status)}`);
  if (statusKeys.has(key)) fail(`Дубликат MES_STATUS_CONTRACTS: ${key}`);
  statusKeys.add(key);
  if (!status.kind) fail(`Статус без kind: ${key}`);
  if (!status.label) fail(`Статус без label: ${key}`);
});

MES_FLOW_TRANSITIONS.forEach((transition) => {
  ["id", "from", "to", "statusScope", "nextStatus", "dataPolicy", "sourceModule", "targetModule"].forEach((field) => {
    if (!transition[field]) fail(`Переход ${transition.id || "без id"} без ${field}`);
  });
  if (!MES_DOCUMENT_KINDS[transition.from]) fail(`Переход ${transition.id} с неизвестным from=${transition.from}`);
  if (!MES_DOCUMENT_KINDS[transition.to]) fail(`Переход ${transition.id} с неизвестным to=${transition.to}`);
  if (!statusKeys.has(`${transition.statusScope}:${transition.nextStatus}`)) {
    fail(`Переход ${transition.id} выставляет статус без контракта: ${transition.statusScope}:${transition.nextStatus}`);
  }
});

checkNoMatches("Запрещен прямой CSS-класс status-${slot.status}", appSource, /status-\$\{slot\.status\}/);
checkNoMatches("Запрещен прямой label GANTT_SLOT_STATUS_LABELS[slot.status]", appSource, /GANTT_SLOT_STATUS_LABELS\[slot\.status\]/);
checkNoMatches("Запрещено прямое сравнение slot.status", appSource, /slot\.status\s*(?:={2,3}|!={1,2})/);
checkNoMatches("Запрещено прямое сравнение route.planningStatus", appSource, /route\.planningStatus\s*(?:={2,3}|!={1,2})/);
checkNoMatches("Запрещен новый UI на SLOT_STATUSES.map", appSource, /SLOT_STATUSES\.map\s*\(/);
checkNoMatches("Запрещен legacy STATUS_LABELS[slot.status]", appSource, /STATUS_LABELS\[slot\.status\]/);

if (!appSource.includes("function getGanttSlotStatusView")) fail("Нет helper getGanttSlotStatusView()");
if (!appSource.includes("function getWorkOrderPlanningStatusValue")) fail("Нет helper getWorkOrderPlanningStatusValue()");
if (!appSource.includes("getMesFlowTransitionsForStatus")) fail("Справочник статусов не показывает переходы по status scope/value");
if (!docsSource.includes("npm run qa:flow")) fail("Документация не описывает qa:flow");

const packageJson = JSON.parse(packageSource);
if (packageJson.scripts?.["qa:flow"] !== "node scripts/flow-contract-qa.mjs") {
  fail("В package.json нет scripts.qa:flow");
}

const legacyProjectIdCount = findLines(appSource, /\bprojectId\b/).length;
const legacyBatchIdCount = findLines(appSource, /\bbatchId\b/).length;
if (legacyProjectIdCount > 0) {
  warn(`projectId все еще присутствует как legacy alias: ${legacyProjectIdCount} строк. Это допустимо только в compatibility/helper зонах.`);
}
if (legacyBatchIdCount > 0) {
  warn(`batchId все еще присутствует как legacy alias: ${legacyBatchIdCount} строк. Не использовать как новую бизнес-сущность.`);
}

console.log("MES Flow Contract QA");
console.log(`Документы: ${requiredDocumentKinds.length}`);
console.log(`Переходы: ${MES_FLOW_TRANSITIONS.length}`);
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
