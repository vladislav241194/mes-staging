import { createReactIslandHost } from "../react_island_host.ts";

const BOARDS_REACT_TARGET = "[data-react-boards-island]";
const BOARDS_REACT_BUNDLE_VERSION = "__MES_BOARDS_REACT_BUNDLE_VERSION__";
const BOARDS_FAILURE_REASONS = new Set([
  "mount-error",
  "react-required",
  "render-error",
]);

function normalizeFailureReason(value) {
  const reason = String(value || "");
  return BOARDS_FAILURE_REASONS.has(reason) ? reason : "runtime-error";
}

function renderBoardsTarget({ activation = {}, failureReason = "", shellState = null } = {}) {
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
    : '<section class="mes-react-runtime-status" role="status"><strong>Загружаем платы и BOM</strong><p>Подготавливаем актуальную производственную модель…</p></section>';
  return `<div class="mes-react-nomenclature-island mes-react-boards-island" data-react-boards-island data-react-island-runtime-mode="${runtimeMode}" data-react-island-state="${state}" aria-busy="${state === "loading" ? "true" : "false"}" aria-live="polite">${content}</div>`;
}

export function createBoardsReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestItemsRender,
  onSelectionChange,
  executeCommand,
  reportError = (error) => console.error("[MES] Boards React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
    getShellState: (activation) => {
      if (activation.featureFlagEnabled !== true) {
        return { state: "error", stage: "runtime", reason: "react-required" };
      }
      if (!["react", "read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) {
        return { state: "error", stage: "runtime", reason: "react-required" };
      }
      return null;
    },
    targetSelector: BOARDS_REACT_TARGET,
    renderTarget: renderBoardsTarget,
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "react-required";
      if (activation.activePane !== "boards") return "unsupported-scope";
      if (activation.accessMode === "react") return "";
      if (activation.accessMode !== "read-only-evaluation" && activation.accessMode !== "write-evaluation") return "react-required";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/boards.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = BOARDS_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : BOARDS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => (
      loadedIsland.mountBoardsReactIsland(target, payload, {
        onError,
        onReady,
        onRequestItems: () => requestItemsRender?.(),
        onSelectionChange,
        onCommand: executeCommand ? (command) => executeCommand(command) : undefined,
      })
    ),
  });
}
