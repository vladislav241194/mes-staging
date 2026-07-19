import { createReactIslandHost } from "../react_island_host.js";

const SPECIFICATIONS2_REACT_TARGET = "[data-react-specifications2-island]";
const SPECIFICATIONS2_REACT_BUNDLE_VERSION = "__MES_SPECIFICATIONS2_REACT_BUNDLE_VERSION__";

export function createSpecifications2ReactIslandHost({
  getActivation,
  getPayload,
  getTargetRoot,
  requestLegacyRender,
  reportError = (error) => console.error("[MES] Specifications 2.0 React island failed", error),
} = {}) {
  return createReactIslandHost({
    getActivation,
    getPayload,
    getTargetRoot,
    requestLegacyRender,
    reportError,
    targetSelector: SPECIFICATIONS2_REACT_TARGET,
    renderTarget: '<div class="mes-react-specifications2-island" data-react-specifications2-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.moduleReady) return "module-not-ready";
      if (!activation.serverReadReady) return "postgres-revision-not-confirmed";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/specifications2.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = SPECIFICATIONS2_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : SPECIFICATIONS2_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady, onRequestLegacy }) => loadedIsland.mountSpecifications2ReactIsland(target, payload, { onError, onReady, onRequestLegacy }),
  });
}
