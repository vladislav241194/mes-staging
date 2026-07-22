import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandMountContext,
} from "../react_island_host.ts";

const SHIFT_MASTER_BOARD_REACT_TARGET = "[data-react-shift-master-board-island]";
const SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION = "__MES_SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION__";
const SHIFT_MASTER_BOARD_PRINT_BUNDLE_VERSION = "__MES_SHIFT_MASTER_BOARD_PRINT_BUNDLE_VERSION__";
const SHIFT_MASTER_BOARD_FAILURE_REASONS = new Set([
  "model-unavailable",
  "mount-error",
  "react-required",
  "read-unavailable",
  "render-error",
]);

type ShiftMasterBoardFocus = "all" | "mine" | "open" | "attention";

interface ShiftMasterBoardActivation {
  accessMode?: string;
  featureFlagEnabled?: boolean;
  policyId?: unknown;
  runtimeMode?: string;
  serverReadFailure?: unknown;
  serverReadReady?: boolean;
}

interface ShiftMasterBoardRenderContext {
  activation?: ShiftMasterBoardActivation;
  failureReason?: string;
  shellState?: { reason?: unknown; state?: unknown } | null;
}

interface ShiftWorkOrdersPrintModule {
  ShiftWorkOrderPrintPreview?: unknown;
  WorkOrderPackagePrintPreview?: unknown;
}

interface ShiftMasterBoardIslandModule {
  mountShiftMasterBoardReactIsland(
    target: HTMLElement,
    payload: unknown,
    options: {
      onCommand?: (command: unknown) => unknown;
      onError: (error: unknown) => void;
      onLoadPrintRenderer: () => Promise<ShiftWorkOrdersPrintModule>;
      onOpenCarryover?: (dateKey: string, carryoverId: string) => unknown;
      onOpenSource?: (dateKey: string, sourceRowId: string) => unknown;
      onPrintDocument?: (rowId: string, employeeId: string, title: string) => unknown;
      onReady: (result: { revision: unknown }) => void;
      onSelectDate?: (dateKey: string) => unknown;
      onSelectFocus?: (focus: ShiftMasterBoardFocus) => unknown;
      onSelectMaster?: (masterId: string) => unknown;
    },
  ): ReactIslandHandle<unknown>;
}

interface ShiftMasterBoardHostOptions {
  executeCommand?: (command: unknown) => unknown;
  getActivation?: () => ShiftMasterBoardActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  openCarryover?: (dateKey: string, carryoverId: string) => unknown;
  openSource?: (dateKey: string, sourceRowId: string) => unknown;
  printDocument?: (rowId: string, employeeId: string, title: string) => unknown;
  reportError?: (error: Error) => void;
  selectDate?: (dateKey: string) => unknown;
  selectFocus?: (focus: ShiftMasterBoardFocus) => unknown;
  selectMaster?: (masterId: string) => unknown;
}

function normalizeFailureReason(value: unknown) {
  const reason = String(value || "");
  return SHIFT_MASTER_BOARD_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderShiftMasterBoardTarget({ activation = {}, failureReason = "", shellState = null }: ShiftMasterBoardRenderContext = {}) {
  const runtimeMode = activation.runtimeMode === "evaluation" ? "evaluation" : "react";
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем мастерскую</strong><p>Получаем актуальные задания смены из PostgreSQL…</p></section>';
  return `<div class="mes-react-shift-master-board-island" data-react-shift-master-board-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page shift-master-board-page" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Оперативное управление</p><h1>Мастерская</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

export function createShiftMasterBoardReactIslandHost({
  executeCommand,
  getActivation,
  getPayload,
  getTargetRoot,
  openCarryover,
  openSource,
  printDocument,
  selectDate,
  selectFocus,
  selectMaster,
  reportError = (error) => console.error("[MES] Shift Master Board React island failed", error),
}: ShiftMasterBoardHostOptions = {}) {
  return createReactIslandHost<ShiftMasterBoardActivation, unknown, ShiftMasterBoardIslandModule>({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (!["react", "read-only-evaluation", "write-evaluation"].includes(activation.accessMode || "")) {
        return { state: "error", stage: "activation", reason: "react-required" };
      }
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      if (!activation.serverReadReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({
      surfaceId: "shiftMasterBoard",
      runtimeMode: activation.runtimeMode,
      policyId: activation.policyId,
    }),
    targetSelector: SHIFT_MASTER_BOARD_REACT_TARGET,
    renderTarget: renderShiftMasterBoardTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode || "")) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/shift-master-board.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href) as Promise<ShiftMasterBoardIslandModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<ShiftMasterBoardIslandModule, unknown>) => loadedIsland!.mountShiftMasterBoardReactIsland(target, payload, {
      onError,
      onReady,
      onCommand: executeCommand ? (command) => executeCommand(command) : undefined,
      onLoadPrintRenderer: async () => {
        const url = new URL("./react-islands/shift-work-orders-print.js", import.meta.url);
        url.searchParams.set("v", SHIFT_MASTER_BOARD_PRINT_BUNDLE_VERSION.startsWith("__MES_") ? String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev") : SHIFT_MASTER_BOARD_PRINT_BUNDLE_VERSION);
        return import(url.href) as Promise<ShiftWorkOrdersPrintModule>;
      },
      onOpenCarryover: openCarryover,
      onOpenSource: openSource,
      onPrintDocument: printDocument,
      onSelectDate: selectDate,
      onSelectFocus: selectFocus,
      onSelectMaster: selectMaster,
    }),
  });
}
