import { createReactIslandHost } from "../react_island_host.js";

const SHIFT_MASTER_BOARD_REACT_TARGET = "[data-react-shift-master-board-island]";
const SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION = "__MES_SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION__";

export function createShiftMasterBoardReactIslandHost({ getActivation, getPayload, getTargetRoot, selectFocus, requestLegacyRender, reportError = (error) => console.error("[MES] Shift Master Board React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: SHIFT_MASTER_BOARD_REACT_TARGET,
    renderTarget: '<div class="mes-react-shift-master-board-island" data-react-shift-master-board-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/shift-master-board.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : SHIFT_MASTER_BOARD_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountShiftMasterBoardReactIsland(target, payload, { onError, onReady, onSelectFocus: selectFocus, onRequestLegacy }),
  });
}
