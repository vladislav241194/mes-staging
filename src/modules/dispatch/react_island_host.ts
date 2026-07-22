import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandMountContext,
} from "../react_island_host.ts";

const DISPATCH_REACT_TARGET = "[data-react-dispatch-island]";
const DISPATCH_REACT_BUNDLE_VERSION = "__MES_DISPATCH_REACT_BUNDLE_VERSION__";
const DISPATCH_FAILURE_REASONS = new Set(["model-unavailable", "read-unavailable", "mount-error", "render-error"]);

interface DispatchActivation {
  runtimeMode?: string;
  serverReadFailure?: unknown;
  serverReadReady?: boolean;
}

interface DispatchHostOptions {
  getActivation?: () => DispatchActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  reportError?: (error: Error) => void;
}

interface DispatchShellState {
  reason?: unknown;
  state?: unknown;
}

interface DispatchRenderContext {
  failureReason?: string;
  shellState?: DispatchShellState | null;
}

interface DispatchLoadedModule {
  mountDispatchReactIsland(
    target: HTMLElement,
    payload: unknown,
    options: {
      onError: (error: unknown) => void;
      onReady: (event: { revision: unknown }) => void;
    },
  ): ReactIslandHandle<unknown>;
}

function normalizeFailureReason(value: unknown) {
  const reason = String(value || "");
  return DISPATCH_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderDispatchTarget({ failureReason = "", shellState = null }: DispatchRenderContext = {}) {
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>Диспетчерская временно недоступна</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем Диспетчерскую</strong><p>Получаем актуальный план и исполнение смены из PostgreSQL…</p></section>';
  return `<div class="mes-react-dispatch-island" data-react-dispatch-island data-react-island-runtime-mode="react" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page dispatch-react" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Оперативное управление</p><h1>Диспетчерская</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

export function createDispatchReactIslandHost({
  getActivation = () => ({ runtimeMode: "react", serverReadReady: false }),
  getPayload = () => ({}),
  getTargetRoot,
  reportError = (error: Error) => console.error("[MES] Dispatch React island failed", error),
}: DispatchHostOptions = {}) {
  return createReactIslandHost<DispatchActivation, unknown, DispatchLoadedModule>({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      if (!activation.serverReadReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      return null;
    },
    getTelemetryContext: () => ({ surfaceId: "dispatch", runtimeMode: "react", policyId: "mes-react-runtime-v1" }),
    targetSelector: DISPATCH_REACT_TARGET,
    renderTarget: renderDispatchTarget,
    getIneligibilityReason: () => "",
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/dispatch.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = DISPATCH_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : DISPATCH_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href) as Promise<DispatchLoadedModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<DispatchLoadedModule, unknown>) => loadedIsland!.mountDispatchReactIsland(target, payload, { onError, onReady }),
  });
}
