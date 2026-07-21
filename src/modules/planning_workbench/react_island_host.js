import { createReactIslandHost } from "../react_island_host.js";

const PLANNING_WORKBENCH_REACT_TARGET = "[data-react-planning-workbench-island]";
const PLANNING_WORKBENCH_REACT_BUNDLE_VERSION = "__MES_PLANNING_WORKBENCH_REACT_BUNDLE_VERSION__";

// Planning-specific legacy controls stay inside the extracted Planning
// boundary. The application shell consumes this selector only while the
// bounded start-date evaluation quiesces browser-owned legacy mutations.
export const PLANNING_WORKBENCH_LEGACY_MUTATION_SELECTOR = [
  "[data-planning-start-date]",
  "[data-planning-route-quantity-form]",
  "[data-planning-boards-per-panel]",
  "[data-planning-labor-note]",
  "[data-planning-order-labor]",
  "[data-planning-supply-mode]",
  "[data-planning-route-to-gantt]",
  "[data-planning-route-cancel]",
  "[data-confirm-approve]",
].join(",");

export function createPlanningWorkbenchReactIslandHost({ getActivation, getPayload, getTargetRoot, requestLegacyRender, executeCommand, navigate, reportError = (error) => console.error("[MES] Planning Workbench React island failed", error) } = {}) {
  return createReactIslandHost({
    getActivation, getPayload, getTargetRoot, requestLegacyRender, reportError,
    targetSelector: PLANNING_WORKBENCH_REACT_TARGET,
    renderTarget: '<div class="mes-react-planning-workbench-island" data-react-planning-workbench-island data-react-island-state="loading" aria-live="polite"></div>',
    getIneligibilityReason: (activation) => {
      if (!activation.featureFlagEnabled) return "disabled";
      if (!activation.serverReadReady) return "server-read-pending";
      if (!["read-only-evaluation", "write-evaluation"].includes(activation.accessMode)) return "write-parity-incomplete";
      return "";
    },
    loadIsland: async () => {
      const islandUrl = new URL("./react-islands/planning-workbench.js", import.meta.url);
      const deployVersion = String(globalThis.window?.__MES_DEPLOY_VERSION__ || "dev");
      const bundleVersion = PLANNING_WORKBENCH_REACT_BUNDLE_VERSION.startsWith("__MES_") ? deployVersion : PLANNING_WORKBENCH_REACT_BUNDLE_VERSION;
      islandUrl.searchParams.set("v", bundleVersion);
      return import(islandUrl.href);
    },
    mountIsland: ({ loadedIsland, target, payload, onError, onReady }) => loadedIsland.mountPlanningWorkbenchReactIsland(target, payload, { onError, onReady, onCommand: executeCommand ? (command) => executeCommand(command) : undefined, onNavigate: navigate ? (navigation) => navigate(navigation) : undefined }),
  });
}
