import { createReactIslandHost } from "../react_island_host.js";

const MARKING_REACT_TARGET = "[data-react-marking-island]";
const MARKING_REACT_BUNDLE_VERSION = "__MES_MARKING_REACT_BUNDLE_VERSION__";

export function createMarkingReactIslandHost({ getActivation, getPayload, getTargetRoot, reportError = (error) => console.error("[MES] Marking React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    reportError,
    targetSelector: MARKING_REACT_TARGET,
    renderTarget: '<div class="mes-react-marking-island" data-react-marking-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => activation.productionEnabled === true ? "" : "disabled",
    canFallbackToLegacy: () => false,
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/marking.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = MARKING_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : MARKING_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountMarkingReactIsland(target, payload, { onError, onReady }),
  });
}
