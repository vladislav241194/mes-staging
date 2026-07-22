import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandMountContext,
} from "../react_island_host.ts";

const SHIFT_WORK_ORDERS_REACT_TARGET = "[data-react-shift-work-orders-island]";
const SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION__";
const SHIFT_WORK_ORDERS_NAVIGATION_INTENTS = new Set(["inspect", "assign", "fact"]);
const SHIFT_WORK_ORDERS_FAILURE_REASONS = new Set([
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "react-required",
  "render-error",
]);

interface ShiftWorkOrdersActivation {
  accessMode?: string;
  featureFlagEnabled?: boolean;
  policyId?: unknown;
  runtimeMode?: string;
  serverReadFailure?: unknown;
  serverReadReady?: boolean;
}

interface ShiftWorkOrdersRenderContext {
  activation?: ShiftWorkOrdersActivation;
  failureReason?: string;
  shellState?: { reason?: unknown; state?: unknown } | null;
}

interface ShiftWorkOrdersNavigation {
  intent?: unknown;
  journalRowId?: unknown;
  shiftDateKey?: unknown;
  sourceRowId?: unknown;
  type?: unknown;
}

interface ShiftWorkOrdersNavigationRow {
  id?: unknown;
  shiftDateKey?: unknown;
  sourceRowId?: unknown;
}

interface ShiftWorkOrdersNavigationOptions {
  canOpenWorkshop?: boolean;
  rows?: readonly ShiftWorkOrdersNavigationRow[];
}

interface ShiftWorkOrdersWorkshopDecision {
  row?: ShiftWorkOrdersNavigationRow | null;
}

interface ShiftMasterBoardSelectionModel {
  dateKey?: unknown;
  selectedRow?: { id?: unknown } | null;
}

interface ShiftWorkOrdersFactModule {
  createShiftWorkOrderAssignmentEditor?: unknown;
  createShiftWorkOrderFactEditor?: unknown;
}

interface ShiftWorkOrdersPrintModule {
  ShiftWorkOrderPrintPreview?: unknown;
  WorkOrderPackagePrintPreview?: unknown;
}

interface ShiftWorkOrdersIslandModule {
  mountShiftWorkOrdersReactIsland(
    target: HTMLElement,
    payload: unknown,
    options: {
      onCommand?: (command: unknown) => unknown;
      onError: (error: unknown) => void;
      onLoadAssignmentContext?: (rowId: string) => unknown;
      onLoadFactEditor: () => Promise<ShiftWorkOrdersFactModule>;
      onLoadPrintPackage?: (rowId: string) => unknown;
      onLoadPrintRenderer: () => Promise<ShiftWorkOrdersPrintModule>;
      onNavigate?: (navigation: ShiftWorkOrdersNavigation) => unknown;
      onPrintDocument?: (title: string) => unknown;
      onReady: (result: { revision: unknown }) => void;
    },
  ): ReactIslandHandle<unknown>;
}

interface ShiftWorkOrdersHostOptions {
  executeCommand?: (command: unknown) => unknown;
  getActivation?: () => ShiftWorkOrdersActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  loadAssignmentContext?: (rowId: string) => unknown;
  loadPrintPackage?: (rowId: string) => unknown;
  navigate?: (navigation: ShiftWorkOrdersNavigation) => unknown;
  printDocument?: (title: string) => unknown;
  reportError?: (error: Error) => void;
}

function normalizeFailureReason(value: unknown) {
  const reason = String(value || "");
  return SHIFT_WORK_ORDERS_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderShiftWorkOrdersTarget({ activation = {}, failureReason = "", shellState = null }: ShiftWorkOrdersRenderContext = {}) {
  const runtimeMode = activation.runtimeMode === "react" ? "react" : activation.runtimeMode === "evaluation" ? "evaluation" : "legacy";
  const unavailableReason = activation.featureFlagEnabled === false ? "react-required" : "";
  const state = failureReason || shellState?.state === "error" || unavailableReason ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || unavailableReason);
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем журнал СЗН</strong><p>Получаем актуальные сменные задания из PostgreSQL…</p></section>';
  return `<div class="mes-react-shift-work-orders-island" data-react-shift-work-orders-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page shift-work-orders-page" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Оперативное управление</p><h1>Журнал СЗН</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

export function resolveShiftWorkOrdersWorkshopNavigation(
  navigation: ShiftWorkOrdersNavigation = {},
  { rows = [], canOpenWorkshop = false }: ShiftWorkOrdersNavigationOptions = {},
) {
  const type = String(navigation.type || "");
  const journalRowId = String(navigation.journalRowId || "").trim();
  const sourceRowId = String(navigation.sourceRowId || "").trim();
  const shiftDateKey = String(navigation.shiftDateKey || "").trim();
  const intent = String(navigation.intent || "");
  if (type !== "open-workshop" || !journalRowId || !sourceRowId || !SHIFT_WORK_ORDERS_NAVIGATION_INTENTS.has(intent)) return { ok: false, message: "Неизвестный переход Журнала СЗН." };
  const navigationRows: readonly ShiftWorkOrdersNavigationRow[] = Array.isArray(rows) ? rows : [];
  const row = navigationRows.find((item) => item?.id === journalRowId && String(item?.sourceRowId || item?.id || "") === sourceRowId) || null;
  if (!row || String(row.shiftDateKey || "") !== shiftDateKey) return { ok: false, message: "Исходная задача изменилась или больше не входит в текущий журнал." };
  if (!canOpenWorkshop) return { ok: false, message: "Нет права открывать Мастерскую." };
  return { ok: true, row, intent };
}

export function isShiftWorkOrdersWorkshopTargetSelected(
  decision: ShiftWorkOrdersWorkshopDecision = {},
  model: ShiftMasterBoardSelectionModel = {},
) {
  const targetRowId = String(decision?.row?.id || decision?.row?.sourceRowId || "").trim();
  const dateKey = String(decision?.row?.shiftDateKey || "").trim();
  return Boolean(targetRowId && dateKey && String(model?.selectedRow?.id || "") === targetRowId && String(model?.dateKey || "") === dateKey);
}

export function createShiftWorkOrdersReactIslandHost({
  executeCommand,
  getActivation,
  getPayload,
  getTargetRoot,
  loadAssignmentContext,
  loadPrintPackage,
  navigate,
  printDocument,
  reportError = (error) => console.error("[MES] Shift Work Orders React island failed", error),
}: ShiftWorkOrdersHostOptions = {}) {
  return createReactIslandHost<ShiftWorkOrdersActivation, unknown, ShiftWorkOrdersIslandModule>({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
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
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode || "")) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/shift-work-orders.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href) as Promise<ShiftWorkOrdersIslandModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<ShiftWorkOrdersIslandModule, unknown>) => loadedIsland!.mountShiftWorkOrdersReactIsland(target, payload, {
      onError,
      onReady,
      onCommand: executeCommand ? (command) => executeCommand(command) : undefined,
      onLoadAssignmentContext: loadAssignmentContext,
      onLoadFactEditor: async () => {
        const url = new URL("./react-islands/shift-work-orders-fact.js", import.meta.url);
        url.searchParams.set("v", SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION.startsWith("__MES_") ? String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev") : SHIFT_WORK_ORDERS_FACT_BUNDLE_VERSION);
        return import(url.href) as Promise<ShiftWorkOrdersFactModule>;
      },
      onLoadPrintPackage: loadPrintPackage,
      onLoadPrintRenderer: async () => {
        const url = new URL("./react-islands/shift-work-orders-print.js", import.meta.url);
        url.searchParams.set("v", SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION.startsWith("__MES_") ? String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev") : SHIFT_WORK_ORDERS_PRINT_BUNDLE_VERSION);
        return import(url.href) as Promise<ShiftWorkOrdersPrintModule>;
      },
      onNavigate: navigate ? (navigation) => navigate(navigation) : undefined,
      onPrintDocument: printDocument,
    }),
  });
}
