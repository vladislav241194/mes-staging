import { createReactIslandHost } from "../react_island_host.js";

const BOARDS_REACT_TARGET = "[data-react-boards-island]";
const BOARDS_REACT_BUNDLE_VERSION = "__MES_BOARDS_REACT_BUNDLE_VERSION__";

export function createBoardsReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestItemsRender,
  requestLegacyRender,
  onSelectionChange,
  reportError = (error) => console.error("[MES] Boards React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: BOARDS_REACT_TARGET,
    renderTarget: '<div class="mes-react-nomenclature-island mes-react-boards-island" data-react-boards-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (activation.activePane !== "boards") return "unsupported-scope";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
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
      })
    ),
  });
}
