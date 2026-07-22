import { createReactIslandHost } from "../react_island_host.js";

const SHIFT_WORK_ORDERS_REACT_TARGET = "[data-react-shift-work-orders-island]";
const SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_NAVIGATION_INTENTS = new Set(["inspect", "assign", "fact"]);
const SHIFT_WORK_ORDERS_FAILURE_REASONS = new Set([
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return SHIFT_WORK_ORDERS_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderShiftWorkOrdersTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react" ? "react" : activation.runtimeMode === "evaluation" ? "evaluation" : "legacy";
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем журнал СЗН</strong><p>Получаем актуальные сменные задания из PostgreSQL…</p></section>';
  return `<div class="mes-react-shift-work-orders-island" data-react-shift-work-orders-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page shift-work-orders-page" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Оперативное управление</p><h1>Журнал СЗН</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

export function resolveShiftWorkOrdersWorkshopNavigation(navigation = {}, { rows = [], canOpenWorkshop = false } = {}) {
  const type = String(navigation.type || "");
  const journalRowId = String(navigation.journalRowId || "").trim();
  const sourceRowId = String(navigation.sourceRowId || "").trim();
  const shiftDateKey = String(navigation.shiftDateKey || "").trim();
  const intent = String(navigation.intent || "");
  if (type !== "open-workshop" || !journalRowId || !sourceRowId || !SHIFT_WORK_ORDERS_NAVIGATION_INTENTS.has(intent)) return { ok: false, message: "Неизвестный переход Журнала СЗН." };
  const row = (Array.isArray(rows) ? rows : []).find((item) => item?.id === journalRowId && String(item?.sourceRowId || item?.id || "") === sourceRowId) || null;
  if (!row || String(row.shiftDateKey || "") !== shiftDateKey) return { ok: false, message: "Исходная задача изменилась или больше не входит в текущий журнал." };
  if (!canOpenWorkshop) return { ok: false, message: "Нет права открывать Мастерскую." };
  return { ok: true, row, intent };
}

export function isShiftWorkOrdersWorkshopTargetSelected(decision = {}, model = {}) {
  const targetRowId = String(decision?.row?.id || decision?.row?.sourceRowId || "").trim();
  const dateKey = String(decision?.row?.shiftDateKey || "").trim();
  return Boolean(targetRowId && dateKey && String(model?.selectedRow?.id || "") === targetRowId && String(model?.dateKey || "") === dateKey);
}

export function createShiftWorkOrdersReactIslandHost({ executeCommand, getActivation, getPayload, getTargetRoot, loadAssignmentContext, loadPrintPackage, navigate, printDocument, requestLegacyRender, reportError = (error) => console.error("[MES] Shift Work Orders React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    canFallbackToLegacy: (activation) => activation.accessMode !== "react",
    getShellState: (activation) => {
      if (activation.accessMode !== "react") return null;
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      if (!activation.serverReadReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({
      surfaceId: "shiftWorkOrders",
      runtimeMode: activation.runtimeMode,
      policyId: activation.policyId,
    }),
    targetSelector: SHIFT_WORK_ORDERS_REACT_TARGET,
    renderTarget: renderShiftWorkOrdersTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/shift-work-orders.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountShiftWorkOrdersReactIsland(target, payload, { onError, onReady, onCommand: executeCommand ? (command) => executeCommand(command) : undefined, onLoadAssignmentContext: loadAssignmentContext, onLoadFactEditor: async () => { const url = new URL("./react-islands/shift-work-orders-fact.js", import.meta.url); url.searchParams.set("v", SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION.startsWith("__MES_") ? String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev") : SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION); return import(url.href); }, onLoadPrintPackage: loadPrintPackage, onLoadPrintRenderer: async () => { const url = new URL("./react-islands/shift-work-orders-print.js", import.meta.url); url.searchParams.set("v", SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION.startsWith("__MES_") ? String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev") : SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION); return import(url.href); }, onNavigate: navigate ? (navigation) => navigate(navigation) : undefined, onPrintDocument: printDocument }),
  });
}
