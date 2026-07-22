import { createReactIslandHost } from "../react_island_host.js";

const GANTT_REACT_TARGET = "[data-react-gantt-island]";
const GANTT_REACT_BUNDLE_VERSION = "__MES_GANTT_REACT_BUNDLE_VERSION__";
const GANTT_FAILURE_REASONS = new Set([
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return GANTT_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderGanttTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react"
    ? "react"
    : activation.runtimeMode === "evaluation"
      ? "evaluation"
      : "legacy";
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем диаграмму Ганта</strong><p>Получаем производственный план из PostgreSQL и подготавливаем временную шкалу…</p></section>';
  return `<div class="mes-react-gantt-island" data-react-gantt-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page is-full-width" data-layout="main-content" data-ui-component="ModulePage"><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Планирование</p><h1>Диаграмма Ганта</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

export function createGanttReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, executeCommand, navigate, reportError = (error) => console.error("[MES] Gantt React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    canFallbackToLegacy: (activation) => activation.accessMode !== "react",
    getShellState: (activation) => {
      if (activation.accessMode !== "react") return null;
      if (activation.serverReadFailure) {
        return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      }
      if (!activation.serverReadReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      if (activation.runtimeFailure) return { state: "error", stage: "model", reason: normalizeFailureReason(activation.runtimeFailure) };
      if (!activation.runtimeReady) return { state: "loading", stage: "model", reason: "model-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({
      surfaceId: "gantt",
      runtimeMode: activation.runtimeMode,
      policyId: activation.policyId,
    }),
    targetSelector: GANTT_REACT_TARGET,
    renderTarget: renderGanttTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.runtimeReady) return "runtime-not-ready";
      if (!activation.postgresProjectionReady) return "postgres-projection-not-ready";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/gantt.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = GANTT_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : GANTT_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountGanttReactIsland(target, payload, { onError, onReady, onCommand: executeCommand ? (command) => executeCommand(command) : undefined, onNavigate: navigate ? (navigation) => navigate(navigation) : undefined }),
  });
}
