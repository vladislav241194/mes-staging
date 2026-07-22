import {
  createReactIslandHost,
  type ReactIslandHandle,
  type ReactIslandMountContext,
} from "../react_island_host.ts";

const CONTOUR_ADMIN_REACT_TARGET = "[data-react-contour-admin-island]";
const CONTOUR_ADMIN_REACT_BUNDLE_VERSION = "__MES_CONTOUR_ADMIN_REACT_BUNDLE_VERSION__";
const CONTOUR_ADMIN_FAILURE_REASONS = new Set(["admin-host-required", "model-unavailable", "mount-error", "react-required", "render-error"]);

interface ContourAdminActivation {
  accessMode?: string;
  adminHostReady?: boolean;
  featureFlagEnabled?: boolean;
  policyId?: unknown;
  runtimeMode?: string;
  serverReadFailure?: unknown;
}

interface ContourAdminRenderContext {
  activation?: ContourAdminActivation;
  failureReason?: string;
  shellState?: { reason?: unknown; state?: unknown } | null;
}

interface ContourAdminIslandModule {
  mountContourAdminReactIsland(
    target: HTMLElement,
    payload: unknown,
    options: {
      onCommand: (command: unknown) => unknown;
      onError: (error: unknown) => void;
      onReady: (result: { revision: unknown }) => void;
    },
  ): ReactIslandHandle<unknown>;
}

interface ContourAdminHostOptions {
  executeCommand?: (command: unknown) => unknown;
  getActivation?: () => ContourAdminActivation;
  getPayload?: () => unknown;
  getTargetRoot?: () => ParentNode | null | undefined;
  reportError?: (error: Error) => void;
}

function normalizeFailureReason(value: unknown) {
  const reason = String(value || "");
  return CONTOUR_ADMIN_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderContourAdminTarget({ activation = {}, failureReason = "", shellState = null }: ContourAdminRenderContext = {}) {
  const runtimeMode = activation.runtimeMode === "evaluation" ? "evaluation" : "react";
  const reactRequired = activation.featureFlagEnabled !== true
    || !["react", "read-only-evaluation", "write-evaluation"].includes(activation.accessMode || "");
  const state = failureReason || reactRequired || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || (reactRequired ? "react-required" : ""));
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>Администрирование временно недоступно</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем контуры</strong><p>Получаем карту окружений и защищённые Ops-сценарии…</p></section>';
  return `<div class="mes-react-contour-admin-island" data-react-contour-admin-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite">${content}</div>`;
}

export function createContourAdminReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  executeCommand,
  reportError = (error) => console.error("[MES] Contour Admin React island failed", error),
}: ContourAdminHostOptions = {}) {
  return createReactIslandHost<ContourAdminActivation, unknown, ContourAdminIslandModule>({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (!activation.adminHostReady) return { state: "error", stage: "read", reason: "admin-host-required" };
      if (activation.featureFlagEnabled !== true
        || !["react", "read-only-evaluation", "write-evaluation"].includes(activation.accessMode || "")) {
        return { state: "error", stage: "activation", reason: "react-required" };
      }
      if (activation.accessMode !== "react") return null;
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      return null;
    },
    getTelemetryContext: (activation) => ({ surfaceId: "contourAdmin", runtimeMode: activation.runtimeMode, policyId: activation.policyId }),
    targetSelector: CONTOUR_ADMIN_REACT_TARGET,
    renderTarget: renderContourAdminTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.adminHostReady) return "admin-host-required";
      if (!activation.featureFlagEnabled) return "react-required";
      if (activation.accessMode === "react") return "";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode || "")) return "react-required";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/contour-admin.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = CONTOUR_ADMIN_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : CONTOUR_ADMIN_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href) as Promise<ContourAdminIslandModule>;
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }: ReactIslandMountContext<ContourAdminIslandModule, unknown>) => loadedIsland!.mountContourAdminReactIsland(target, payload, {
      onError,
      onReady,
      onCommand: (command) => executeCommand?.(command),
    }),
  });
}
