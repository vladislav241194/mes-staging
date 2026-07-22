import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandShellState,
  type ReactIslandTargetRoot,
} from "../react_island_host.ts";

interface PlanningWorkbenchActivation {
  accessMode: string;
  featureFlagEnabled: boolean;
  policyId?: unknown;
  runtimeMode: string;
  serverReadFailure?: unknown;
  serverReadReady: boolean;
}

type PlanningWorkbenchLaborSetting =
  | { mode: "fixed"; fixedMinutes: number }
  | { mode: "unit"; minutesPerUnit: number }
  | { mode: "panel"; minutesPerPanel: number }
  | { mode: "shift"; shiftQuantity: number };

type PlanningWorkbenchCommand =
  | { type: "request-elevation" }
  | { type: "change-quantity"; routeId: string; quantity: number; expectedRevision: number }
  | { type: "change-slot"; routeId: string; operationId: string; slotId: string; plannedStart: string; expectedRevision: number }
  | { type: "change-start-date"; routeId: string; planningStartDate: string | null; expectedRevision: number; idempotencyKey: string }
  | { type: "change-labor"; routeId: string; operationId: string; labor: PlanningWorkbenchLaborSetting; expectedRevision: number }
  | { type: "transfer-to-gantt"; routeId: string; expectedRevision: number }
  | { type: "cancel"; routeId: string; expectedRevision: number };

type PlanningWorkbenchNavigation = { type: "select-route" | "select-item"; id: string };

interface PlanningWorkbenchActionResult {
  [key: string]: unknown;
  ok?: boolean;
  message?: string;
}

type PlanningWorkbenchCommandHandler = (command: PlanningWorkbenchCommand) => Promise<PlanningWorkbenchActionResult | void>;
type PlanningWorkbenchNavigationHandler = (navigation: PlanningWorkbenchNavigation) => Promise<PlanningWorkbenchActionResult | void>;

interface PlanningWorkbenchHostOptions {
  executeCommand?: PlanningWorkbenchCommandHandler;
  getActivation?: () => PlanningWorkbenchActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ReactIslandTargetRoot | null | undefined;
  navigate?: PlanningWorkbenchNavigationHandler;
  reportError?: (error: Error) => void;
}

interface PlanningWorkbenchLoadedModule {
  mountPlanningWorkbenchReactIsland(
    target: HTMLElement,
    payload: unknown,
    options: {
      onError: (error: unknown) => void;
      onReady: (result: { revision: unknown }) => void;
      onCommand?: PlanningWorkbenchCommandHandler;
      onNavigate?: PlanningWorkbenchNavigationHandler;
    },
  ): ReactIslandHandle<unknown>;
}

interface PlanningWorkbenchRenderContext {
  activation?: Partial<PlanningWorkbenchActivation>;
  failureReason?: string;
  shellState?: ReactIslandShellState | null;
}

const PLANNING_WORKBENCH_REACT_TARGET = "[data-react-planning-workbench-island]";
const PLANNING_WORKBENCH_REACT_BUNDLE_VERSION = "__MES_PLANNING_WORKBENCH_REACT_BUNDLE_VERSION__";
const PLANNING_WORKBENCH_FAILURE_REASONS = new Set([
  "evaluation-disabled",
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
  "runtime-policy-disabled",
]);

function normalizeFailureReason(value: unknown): string {
  const reason = String(value || "");
  return PLANNING_WORKBENCH_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderPlanningWorkbenchTarget({ activation = {}, failureReason = "", shellState = null }: PlanningWorkbenchRenderContext = {}): string {
  const runtimeMode = activation.runtimeMode === "react" ? "react" : activation.runtimeMode === "evaluation" ? "evaluation" : "disabled";
  const inactiveReason = activation.featureFlagEnabled === true
    ? ""
    : activation.runtimeMode === "evaluation" ? "evaluation-disabled" : "runtime-policy-disabled";
  const state = failureReason || inactiveReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || inactiveReason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем заказ-наряды</strong><p>Получаем актуальный состав из PostgreSQL…</p></section>';
  return `<div class="mes-react-planning-workbench-island" data-react-planning-workbench-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page has-sidebar module-layout planning-order-page" data-ui-contract="ops-soft-v1 visual-parity-v2" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><aside class="module-sidebar" aria-label="Список заказ-нарядов" data-ui-component="ModuleSidebar"><strong>Заказ-наряды</strong></aside><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Планирование</p><h1>Заказ-наряды</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

export function createPlanningWorkbenchReactIslandHost({ getActivation, getPayload, getTargetRoot, executeCommand, navigate, reportError = (error) => console.error("[MES] Planning Workbench React island failed", error) }: PlanningWorkbenchHostOptions = {}) {
  return createReactIslandHost<PlanningWorkbenchActivation, unknown, PlanningWorkbenchLoadedModule>({
    getActivation, getPayload, getTargetRoot, reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (activation.featureFlagEnabled !== true) return null;
      if (activation.serverReadFailure) {
        return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      }
      if (!activation.serverReadReady) {
        return { state: "loading", stage: "read", reason: "server-read-pending" };
      }
      return null;
    },
    getTelemetryContext: (activation) => ({
      surfaceId: "planningWorkbench",
      runtimeMode: activation.runtimeMode,
      policyId: activation.policyId,
    }),
    targetSelector: PLANNING_WORKBENCH_REACT_TARGET,
    renderTarget: renderPlanningWorkbenchTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async (): Promise<PlanningWorkbenchLoadedModule> => {
      const islandUrl = new URL("./react-islands/planning-workbench.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = PLANNING_WORKBENCH_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : PLANNING_WORKBENCH_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href) as Promise<PlanningWorkbenchLoadedModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland!.mountPlanningWorkbenchReactIsland(target, payload, { onError, onReady, onCommand: executeCommand ? (command) => executeCommand(command) : undefined, onNavigate: navigate ? (navigation) => navigate(navigation) : undefined }),
  });
}
