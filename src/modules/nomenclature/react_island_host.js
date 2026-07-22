import { createReactIslandHost } from "../react_island_host.ts";

const NOMENCLATURE_REACT_TARGET = "[data-react-nomenclature-island]";
const NOMENCLATURE_REACT_BUNDLE_VERSION = "__MES_NOMENCLATURE_REACT_BUNDLE_VERSION__";
const NOMENCLATURE_FAILURE_REASONS = new Set([
  "mount-error",
  "read-unavailable",
  "react-required",
  "render-error",
  "shared-state-unconfigured",
]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return NOMENCLATURE_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderNomenclatureTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react"
    ? "react"
    : activation.runtimeMode === "evaluation"
      ? "evaluation"
      : "disabled";
  const reactRequired = activation.featureFlagEnabled !== true
    || !["react", "read-only-evaluation", "write-evaluation"].includes(activation.accessMode);
  const state = failureReason || reactRequired || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || (reactRequired ? "react-required" : ""));
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>React-модуль временно недоступен</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем номенклатуру</strong><p>Получаем актуальный справочник из общего хранилища…</p></section>';
  return `<div class="mes-react-nomenclature-island" data-react-nomenclature-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page has-sidebar module-layout nomenclature-page" data-ui-contract="ops-soft-v1 visual-parity-v2" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><aside class="module-sidebar" aria-label="Разделы номенклатуры" data-ui-component="ModuleSidebar"><strong>Разделы</strong></aside><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Технологии</p><h1>Номенклатура</h1></div></header><div class="module-data-content ui-module-content" data-ui-component="ModuleContent">${content}</div></div></section></div>`;
}

export function createNomenclatureReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  navigateBoards,
  executeCommand,
  reportTelemetry,
  reportError = (error) => console.error("[MES] Nomenclature React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (activation.featureFlagEnabled !== true) {
        return { state: "error", stage: "runtime", reason: "react-required" };
      }
      if (!["react", "read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) {
        return { state: "error", stage: "runtime", reason: "react-required" };
      }
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
      surfaceId: "nomenclature",
      runtimeMode: activation.runtimeMode,
      policyId: activation.policyId,
    }),
    reportTelemetry,
    reportError,
    targetSelector: NOMENCLATURE_REACT_TARGET,
    renderTarget: renderNomenclatureTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "react-required";
      if (activation.activePane !== "items") return "unsupported-scope";
      if (activation.accessMode === "react") return "";
      if (activation.accessMode !== "read-only-evaluation" && activation.accessMode !== "write-evaluation") {
        return "react-required";
      }
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/nomenclature.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = NOMENCLATURE_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : NOMENCLATURE_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => (
      loadedIsland.mountNomenclatureReactIsland(target, payload, {
        onError,
        onReady,
        onRequestBoards: () => navigateBoards?.(),
        onCommand: (command) => executeCommand?.(command),
      })
    ),
  });
}
