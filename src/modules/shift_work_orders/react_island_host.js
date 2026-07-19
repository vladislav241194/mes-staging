import { createReactIslandHost } from "../react_island_host.js";

const SHIFT_WORK_ORDERS_REACT_TARGET = "[data-react-shift-work-orders-island]";
const SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION = "__MES_SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION__";

export function createShiftWorkOrdersReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError = (error) => console.error("[MES] Shift Work Orders React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: SHIFT_WORK_ORDERS_REACT_TARGET,
    renderTarget: '<div class="mes-react-shift-work-orders-island" data-react-shift-work-orders-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/shift-work-orders.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : SHIFT_WORK_ORDERS_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountShiftWorkOrdersReactIsland(target, payload, { onError, onReady, onRequestLegacy }),
  });
}
