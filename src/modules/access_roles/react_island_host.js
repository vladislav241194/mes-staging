import { createReactIslandHost } from "../react_island_host.js";

const ROLES_REACT_TARGET = "[data-react-roles-island]";
const ROLES_REACT_BUNDLE_VERSION = "__MES_ROLES_REACT_BUNDLE_VERSION__";
const ROLES_FAILURE_REASONS = new Set([
  "model-unavailable",
  "mount-error",
  "read-unavailable",
  "render-error",
]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return ROLES_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderRolesTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
  const runtimeMode = activation.runtimeMode === "react"
    ? "react"
    : activation.runtimeMode === "evaluation"
      ? "evaluation"
      : "legacy";
  const state = failureReason || shellState?.state === "error" ? "error" : "loading";
  const reason = normalizeFailureReason(failureReason || shellState?.reason || "");
  const content = state === "error"
    ? `<section class="mes-react-runtime-error" role="alert"><strong>Роли и доступ временно недоступны</strong><p>Код ошибки: ${reason}</p></section>`
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем роли и доступ</strong><p>Получаем каноническую модель Access Control из PostgreSQL…</p></section>';
  return `<div class="mes-react-roles-island" data-react-roles-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite"><main class="module-page access-roles-page"><section class="workspace"><section class="workspace-main">${content}</section></section></main></div>`;
}

export function createRolesReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  executeCommand,
  reportError = (error) => console.error("[MES] Roles React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
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
      surfaceId: "roles",
      runtimeMode: activation.runtimeMode,
      policyId: activation.policyId,
    }),
    targetSelector: ROLES_REACT_TARGET,
    renderTarget: renderRolesTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.accessMode === "react") return "";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/roles.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = ROLES_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : ROLES_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => (
      loadedIsland.mountRolesReactIsland(target, payload, { onError, onReady, onCommand: executeCommand ? (command) => executeCommand(command) : undefined })
    ),
  });
}
