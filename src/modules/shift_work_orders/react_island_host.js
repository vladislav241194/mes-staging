import { createReactIslandHost } from "../react_island_host.js";

const SHIFT_WORK_ORDERS_REACT_TARGET = "[data-react-shift-work-orders-island]";
const SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_NAVIGATION_INTENTS = new Set(["inspect", "assign", "fact"]);

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
  const sourceRowId = String(decision?.row?.sourceRowId || decision?.row?.id || "").trim();
  const dateKey = String(decision?.row?.shiftDateKey || "").trim();
  return Boolean(sourceRowId && dateKey && String(model?.selectedRow?.id || "") === sourceRowId && String(model?.dateKey || "") === dateKey);
}

export function createShiftWorkOrdersReactIslandHost({ executeCommand, getActivation, getPayload, getTargetRoot, loadAssignmentContext, loadPrintPackage, navigate, printDocument, requestLegacyRender, reportError = (error) => console.error("[MES] Shift Work Orders React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: SHIFT_WORK_ORDERS_REACT_TARGET,
    renderTarget: '<div class="mes-react-shift-work-orders-island" data-react-shift-work-orders-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
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
