import { createReactIslandHost } from "../react_island_host.js";

const WEEKLY_PRODUCTION_CONTROL_REACT_TARGET = "[data-react-weekly-production-control-island]";
const WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION = "__MES_WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION__";
const WEEKLY_PRODUCTION_CONTROL_FAILURE_REASONS = new Set([
  "compatibility-fallback",
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
  "unsupported-scope",
]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return WEEKLY_PRODUCTION_CONTROL_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderWeeklyProductionControlTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react" ? "react" : activation.runtimeMode === "evaluation" ? "evaluation" : "legacy";
  const state = failureReason ? "error" : shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем контроль недели</strong><p>Получаем актуальный недельный план и факт…</p></section>';
  return `<div class="mes-react-weekly-production-control-island" data-react-weekly-production-control-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite">${content}</div>`;
}

export function createWeeklyProductionControlReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  reportTelemetry,
  reportError = (error) => console.error("[MES] Weekly Production Control React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    canFallbackToLegacy: (activation) => activation.accessMode !== "react",
    getShellState: (activation) => {
      if (activation.accessMode !== "react") return null;
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      if (!activation.serverReadReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({
      surfaceId: "weeklyProductionControl",
      runtimeMode: activation.runtimeMode,
      policyId: activation.policyId,
    }),
    reportTelemetry,
    reportError,
    targetSelector: WEEKLY_PRODUCTION_CONTROL_REACT_TARGET,
    renderTarget: renderWeeklyProductionControlTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/weekly-production-control.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => (
      loadedIsland.mountWeeklyProductionControlReactIsland(target, payload, { onError, onReady })
    ),
  });
}
