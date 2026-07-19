import { createReactIslandHost } from "../react_island_host.js";

const WEEKLY_PRODUCTION_CONTROL_REACT_TARGET = "[data-react-weekly-production-control-island]";
const WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION = "__MES_WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION__";

export function createWeeklyProductionControlReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  reportError = (error) => console.error("[MES] Weekly Production Control React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: WEEKLY_PRODUCTION_CONTROL_REACT_TARGET,
    renderTarget: '<div class="mes-react-weekly-production-control-island" data-react-weekly-production-control-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/weekly-production-control.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION.startsWith("__MES_")
        ? deployVersion
        : WEEKLY_PRODUCTION_CONTROL_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => (
      loadedIsland.mountWeeklyProductionControlReactIsland(target, payload, { onError, onReady })
    ),
  });
}
