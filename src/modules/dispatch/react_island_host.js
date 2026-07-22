import { createReactIslandHost } from "../react_island_host.js";

const DISPATCH_REACT_TARGET = "[data-react-dispatch-island]";
const DISPATCH_REACT_BUNDLE_VERSION = "__MES_DISPATCH_REACT_BUNDLE_VERSION__";

export function createDispatchReactIslandHost({ getTargetRoot, reportError = (error) => console.error("[MES] Dispatch React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation: () => ({ demoEnabled: true, runtimeMode: "react-mock" }),
    getPayload: () => ({ mode: "scope-pending", persistence: "none" }),
    getTargetRoot,
    reportError,
    canFallbackToLegacy: () => false,
    targetSelector: DISPATCH_REACT_TARGET,
    renderTarget: '<div class="mes-react-dispatch-island" data-react-dispatch-island data-react-island-runtime-mode="react-mock" data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => activation.demoEnabled === true ? "" : "disabled",
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/dispatch.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = DISPATCH_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : DISPATCH_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountDispatchReactIsland(target, payload, { onError, onReady }),
  });
}
