import { createReactIslandHost } from "../react_island_host.js";

const AUTH_PICKER_TARGET = "[data-react-auth-picker-island]";
const AUTH_PICKER_BUNDLE_VERSION = "__MES_AUTH_PICKER_REACT_BUNDLE_VERSION__";

const AUTH_PICKER_FAILURE_REASONS = new Set([
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return AUTH_PICKER_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderAuthPickerTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react" ? "react" : "evaluation";
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>Авторизация временно недоступна</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем авторизацию</strong><p>Получаем сотрудников и права входа…</p></section>';
  return `<div class="mes-react-auth-picker-island" data-react-auth-picker-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite">${content}</div>`;
}

export function createAuthPickerReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, executeCommand, reportError = (error) => console.error("[MES] Authorization picker React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    canFallbackToLegacy: (activation) => activation.accessMode !== "react",
    getShellState: (activation) => {
      if (activation.accessMode !== "react") return null;
      if (activation.serverReadFailure) return { state: "error", stage: "read", reason: normalizeFailureReason(activation.serverReadFailure) };
      if (!activation.moduleReady || !activation.systemDomainsReady) return { state: "loading", stage: "read", reason: "server-read-pending" };
      return null;
    },
    getTelemetryContext: (activation) => ({
      surfaceId: "authPicker",
      runtimeMode: activation.runtimeMode,
      policyId: activation.policyId,
    }),
    targetSelector: AUTH_PICKER_TARGET,
    renderTarget: renderAuthPickerTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.moduleReady) return "module-not-ready";
      if (!activation.systemDomainsReady) return "postgres-system-domains-not-ready";
      if (!activation.authGateReady) return "auth-gate-not-locked";
      if (!activation.pickerReady) return "pin-step-owned-by-legacy";
      if (activation.accessMode !== "read-only-evaluation" && activation.accessMode !== "write-evaluation") return "security-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/auth-picker.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = AUTH_PICKER_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : AUTH_PICKER_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountAuthPickerReactIsland(target, payload, {
      onError,
      onReady,
      onRequestLegacy: getActivation?.().accessMode === "react" ? undefined : onRequestLegacy,
      onCommand: (command) => executeCommand?.(command),
    }),
  });
}
