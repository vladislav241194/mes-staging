import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandMountContext,
} from "../react_island_host.ts";

const EMPLOYEE_DESKTOP_REACT_TARGET = "[data-react-employee-desktop-island]";
const EMPLOYEE_DESKTOP_REACT_BUNDLE_VERSION = "__MES_EMPLOYEE_DESKTOP_REACT_BUNDLE_VERSION__";

const EMPLOYEE_DESKTOP_FAILURE_REASONS = new Set(["model-unavailable", "mount-error", "read-unavailable", "render-error"]);

interface EmployeeDesktopActivation {
  accessMode?: string;
  featureFlagEnabled?: boolean;
  policyId?: string;
  runtimeMode?: string;
  serverReadFailure?: unknown;
  serverReadReady?: boolean;
}

interface EmployeeDesktopHostOptions {
  executeCommand?: (command: unknown) => unknown;
  getActivation?: () => EmployeeDesktopActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  reportError?: (error: Error) => void;
}

interface EmployeeDesktopShellState {
  reason?: unknown;
  state?: unknown;
}

interface EmployeeDesktopRenderContext {
  activation?: EmployeeDesktopActivation;
  failureReason?: string;
  shellState?: EmployeeDesktopShellState | null;
}

interface EmployeeDesktopLoadedModule {
  mountEmployeeDesktopReactIsland(
    target: HTMLElement,
    payload: unknown,
    options: {
      onCommand?: (command: unknown) => unknown;
      onError: (error: unknown) => void;
      onReady: (event: { revision: unknown }) => void;
    },
  ): ReactIslandHandle<unknown>;
}

function normalizeFailureReason(value: unknown) {
  const reason = String(value || "");
  return EMPLOYEE_DESKTOP_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderEmployeeDesktopTarget({ activation = {}, failureReason = "", shellState = null }: EmployeeDesktopRenderContext = {}) {
  const runtimeMode = activation.runtimeMode === "react" ? "react" : "evaluation";
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>Рабочий стол временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : "<section class=\"mes-react-runtime-status\" role=\"status\"><strong>Загружаем рабочий стол</strong><p>Получаем задания и факты из PostgreSQL…</p></section>";
  return `<div class="mes-react-employee-desktop-island" data-react-employee-desktop-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite">${content}</div>`;
}

export function createEmployeeDesktopReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  executeCommand,
  reportError = (error: Error) => console.error("[MES] Employee Desktop React island failed", error),
}: EmployeeDesktopHostOptions = {}) {
  return createReactIslandHost<EmployeeDesktopActivation, unknown, EmployeeDesktopLoadedModule>({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (!activation.featureFlagEnabled) return { state: "error", stage: "policy", reason: "model-unavailable" };
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      if (!activation.serverReadReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({ surfaceId: "employeeDesktop", runtimeMode: activation.runtimeMode, policyId: activation.policyId }),
    targetSelector: EMPLOYEE_DESKTOP_REACT_TARGET,
    renderTarget: renderEmployeeDesktopTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode || "")) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/employee-desktop.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = EMPLOYEE_DESKTOP_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : EMPLOYEE_DESKTOP_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href) as Promise<EmployeeDesktopLoadedModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<EmployeeDesktopLoadedModule, unknown>) => loadedIsland!.mountEmployeeDesktopReactIsland(target, payload, {
      onError,
      onReady,
      onCommand: executeCommand ? (command) => executeCommand(command) : undefined,
    }),
  });
}
