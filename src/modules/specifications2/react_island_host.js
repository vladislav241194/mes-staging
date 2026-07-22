import { createReactIslandHost } from "../react_island_host.js";

const SPECIFICATIONS2_REACT_TARGET = "[data-react-specifications2-island]";
const SPECIFICATIONS2_REACT_BUNDLE_VERSION = "__MES_SPECIFICATIONS2_REACT_BUNDLE_VERSION__";
const SPECIFICATIONS2_FAILURE_REASONS = new Set(["model-unavailable", "mount-error", "render-error"]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return SPECIFICATIONS2_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderSpecifications2Target({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react"
    ? "react"
    : activation.runtimeMode === "evaluation"
      ? "evaluation"
      : "legacy";
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>Спецификации 2.0 временно недоступны</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем Спецификации 2.0</strong><p>Получаем реестр и опубликованные ревизии…</p></section>';
  return `<div class="mes-react-specifications2-island" data-react-specifications2-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><section class="module-page module-data-page ui-module-page specifications2-page" data-ui-runtime="hard-v1" data-layout="main-content" data-ui-component="ModulePage"><div class="directory-workspace module-data-workspace ui-module-workspace" data-layout="page-workspace" data-ui-component="ModuleWorkspace"><header class="module-header ui-module-header" data-ui-component="ModuleHeader"><div><p>Технологии</p><h1>Спецификации 2.0</h1></div></header><div class="module-data-content ui-module-content">${content}</div></div></section></div>`;
}

export function createSpecifications2ReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  executeCommand,
  reportError = (error) => console.error("[MES] Specifications 2.0 React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    canFallbackToLegacy: (activation) => activation.accessMode !== "react",
    getShellState: (activation) => {
      if (activation.accessMode !== "react") return null;
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      if (!activation.moduleReady) return { state: "loading", stage: "model", reason: "model-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({ surfaceId: "specifications2", runtimeMode: activation.runtimeMode, policyId: activation.policyId }),
    targetSelector: SPECIFICATIONS2_REACT_TARGET,
    renderTarget: renderSpecifications2Target,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.moduleReady) return "module-not-ready";
      if (!activation.serverReadReady) return "postgres-revision-not-confirmed";
      if (activation.accessMode !== "read-only-evaluation" && activation.accessMode !== "write-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/specifications2.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = SPECIFICATIONS2_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : SPECIFICATIONS2_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountSpecifications2ReactIsland(target, payload, {
      onError,
      onReady,
      onCommand: (command) => executeCommand?.(command),
    }),
  });
}
