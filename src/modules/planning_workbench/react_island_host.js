import { createReactIslandHost } from "../react_island_host.js";

const PLANNING_WORKBENCH_REACT_TARGET = "[data-react-planning-workbench-island]";
const PLANNING_WORKBENCH_REACT_BUNDLE_VERSION = "__MES_PLANNING_WORKBENCH_REACT_BUNDLE_VERSION__";

export function createPlanningWorkbenchReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, navigate, reportError = (error) => console.error("[MES] Planning Workbench React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: PLANNING_WORKBENCH_REACT_TARGET,
    renderTarget: '<div class="mes-react-planning-workbench-island" data-react-planning-workbench-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (activation.accessMode !== "read-only-evaluation") return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/planning-workbench.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = PLANNING_WORKBENCH_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : PLANNING_WORKBENCH_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountPlanningWorkbenchReactIsland(target, payload, { onError, onReady, onNavigate: navigate ? (navigation) => navigate(navigation) : undefined }),
  });
}
