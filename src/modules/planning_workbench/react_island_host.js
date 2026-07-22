import { createReactIslandHost } from "../react_island_host.js";

const PLANNING_WORKBENCH_REACT_TARGET = "[data-react-planning-workbench-island]";
const PLANNING_WORKBENCH_REACT_BUNDLE_VERSION = "__MES_PLANNING_WORKBENCH_REACT_BUNDLE_VERSION__";
const PLANNING_WORKBENCH_FAILURE_REASONS = new Set([
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return PLANNING_WORKBENCH_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderPlanningWorkbenchTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react"
    ? "react"
    : activation.runtimeMode === "evaluation"
      ? "evaluation"
      : "legacy";
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем заказ-наряды</strong><p>Получаем актуальный состав из PostgreSQL…</p></section>';
  return `<div class="mes-react-planning-workbench-island" data-react-planning-workbench-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page has-sidebar module-layout planning-order-page" data-ui-contract="ops-soft-v1 visual-parity-v2" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><aside class="module-sidebar" aria-label="Список заказ-нарядов" data-ui-component="ModuleSidebar"><strong>Заказ-наряды</strong></aside><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Планирование</p><h1>Заказ-наряды</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

// Planning-specific legacy controls stay inside the extracted Planning
// boundary. The application shell consumes this selector only while the
// bounded start-date evaluation quiesces browser-owned legacy mutations.
export const PLANNING_WORKBENCH_LEGACY_MUTATION_SELECTOR = [
  "[data-planning-start-date]",
  "[data-planning-route-quantity-form]",
  "[data-planning-boards-per-panel]",
  "[data-planning-labor-note]",
  "[data-planning-order-labor]",
  "[data-planning-supply-mode]",
  "[data-planning-route-to-gantt]",
  "[data-planning-route-cancel]",
  "[data-confirm-approve]",
].join(",");

export function createPlanningWorkbenchReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, executeCommand, navigate, reportError = (error) => console.error("[MES] Planning Workbench React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    canFallbackToLegacy: (activation) => activation.accessMode !== "react",
    getShellState: (activation) => {
      if (activation.accessMode !== "react") return null;
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
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/planning-workbench.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = PLANNING_WORKBENCH_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : PLANNING_WORKBENCH_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountPlanningWorkbenchReactIsland(target, payload, { onError, onReady, onCommand: executeCommand ? (command) => executeCommand(command) : undefined, onNavigate: navigate ? (navigation) => navigate(navigation) : undefined }),
  });
}
